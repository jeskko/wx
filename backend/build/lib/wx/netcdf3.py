"""Minimal reader for NetCDF classic / 64-bit offset files (CDF1/CDF2), standard library only.

Enough for FMI's download service output: dimensions, attributes and float/int variables,
including record (unlimited-dimension) variables. Values come back as flat `array`s in
C order (last dimension fastest).
"""

import struct
import sys
from array import array
from dataclasses import dataclass, field

NC_DIMENSION, NC_VARIABLE, NC_ATTRIBUTE = 0x0A, 0x0B, 0x0C
# nc_type -> (struct char, size, array typecode)
TYPES = {1: ("b", 1, "b"), 2: ("c", 1, "B"), 3: ("h", 2, "h"), 4: ("i", 4, "i"), 5: ("f", 4, "f"), 6: ("d", 8, "d")}


class NetCDFError(Exception):
    pass


@dataclass
class Variable:
    name: str
    dims: list[str]
    shape: list[int]
    attrs: dict
    nc_type: int
    vsize: int
    begin: int
    is_record: bool = False
    _file: "Dataset | None" = field(default=None, repr=False)

    def values(self) -> array:
        assert self._file is not None
        return self._file._read(self)


class Dataset:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        magic = data[:4]
        if magic[:3] != b"CDF" or magic[3] not in (1, 2):
            raise NetCDFError("not a NetCDF classic file")
        self.offset64 = magic[3] == 2
        self.pos = 4
        self.numrecs = self._int()
        self.dims: list[tuple[str, int]] = self._dims()
        self.attrs = self._attrs()
        self.variables: dict[str, Variable] = {v.name: v for v in self._vars()}
        rec = [v for v in self.variables.values() if v.is_record]
        # record size: sum of record variables' vsize (a single record var is not padded)
        self.recsize = rec[0].vsize if len(rec) == 1 else sum(v.vsize for v in rec)

    # -- header primitives
    def _int(self) -> int:
        (v,) = struct.unpack_from(">i", self.data, self.pos)
        self.pos += 4
        return v

    def _name(self) -> str:
        n = self._int()
        s = self.data[self.pos : self.pos + n].decode("utf-8", "replace")
        self.pos += (n + 3) & ~3
        return s

    def _dims(self) -> list[tuple[str, int]]:
        tag, n = self._int(), self._int()
        if tag not in (0, NC_DIMENSION):
            raise NetCDFError("bad dim list")
        return [(self._name(), self._int()) for _ in range(n)]

    def _attrs(self) -> dict:
        tag, n = self._int(), self._int()
        if tag not in (0, NC_ATTRIBUTE):
            raise NetCDFError("bad attribute list")
        out = {}
        for _ in range(n):
            name = self._name()
            t, count = self._int(), self._int()
            ch, size, _ = TYPES[t]
            raw = self.data[self.pos : self.pos + size * count]
            self.pos += (size * count + 3) & ~3
            if t == 2:
                out[name] = raw.decode("utf-8", "replace").rstrip("\x00")
            else:
                vals = struct.unpack(f">{count}{ch}", raw)
                out[name] = vals[0] if count == 1 else list(vals)
        return out

    def _vars(self) -> list[Variable]:
        tag, n = self._int(), self._int()
        if tag not in (0, NC_VARIABLE):
            raise NetCDFError("bad variable list")
        out = []
        for _ in range(n):
            name = self._name()
            nd = self._int()
            ids = [self._int() for _ in range(nd)]
            attrs = self._attrs()
            t, vsize = self._int(), self._int()
            if self.offset64:
                (begin,) = struct.unpack_from(">q", self.data, self.pos)
                self.pos += 8
            else:
                begin = self._int()
            dims = [self.dims[i][0] for i in ids]
            shape = [self.dims[i][1] for i in ids]
            is_rec = bool(ids) and self.dims[ids[0]][1] == 0
            if is_rec:
                shape[0] = self.numrecs
            out.append(Variable(name, dims, shape, attrs, t, vsize, begin, is_rec, self))
        return out

    def _read(self, v: Variable) -> array:
        ch, size, code = TYPES[v.nc_type]
        out = array(code)
        if v.is_record:
            per = 1
            for s in v.shape[1:]:
                per *= s
            for r in range(self.numrecs):
                off = v.begin + r * self.recsize
                out.frombytes(self.data[off : off + per * size])
        else:
            n = 1
            for s in v.shape:
                n *= s
            out.frombytes(self.data[v.begin : v.begin + n * size])
        if size > 1 and sys.byteorder == "little":
            out.byteswap()  # file is big-endian
        return out
