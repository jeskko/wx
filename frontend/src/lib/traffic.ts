// Digitraffic traffic announcements (roads/messages.json). The feed is Finnish only; the
// feature lines come from a fixed vocabulary, so the common ones are translated here and
// anything unknown is shown in Finnish.

import type { Lang } from './types';

export interface TrafficMessage {
  id: string;
  kind: 'accident' | 'closed' | 'lane' | 'other';
  title: string;
  features: string[];
  comment: string;
  road: number | null;
  municipality: string | null;
  start: string | null;
  end: string | null;
  updated: string | null;
  lat: number | null;
  lon: number | null;
}

export interface TrafficFile {
  updated: string;
  messages: TrafficMessage[];
}

const EN: Record<string, string> = {
  // closures and lanes
  'Tie on suljettu liikenteeltä': 'Road closed',
  'Tie suljettu liikenteeltä': 'Road closed',
  'Tie on ajoittain suljettu liikenteeltä': 'Road closed at times',
  'Tie ajoittain suljettu liikenteeltä': 'Road closed at times',
  'Tie on avattu liikenteelle': 'Road reopened',
  'Tie normaalisti käytössä': 'Road open as normal',
  'Silta suljettu liikenteeltä': 'Bridge closed',
  'Silta on suljettu liikenteeltä': 'Bridge closed',
  'Jäätie auki': 'Ice road open',
  'Jäätie suljettu': 'Ice road closed',
  'Ajokaista suljettu liikenteeltä': 'Lane closed',
  'Yksi ajokaista suljettu liikenteeltä': 'One lane closed',
  'Yksi ajokaista suljettu': 'One lane closed',
  'Kaksi ajokaistaa suljettu liikenteeltä': 'Two lanes closed',
  'Ajokaistoja suljettu liikenteeltä': 'Lanes closed',
  'Ajokaistoja on suljettu liikenteeltä': 'Lanes closed',
  'Ajokaistoja on kavennettu': 'Narrowed lanes',
  'Ajokaista kavennettu työmaan kohdalla': 'Lane narrowed at roadworks',
  'Vain yksi ajokaista käytössä': 'Only one lane open',
  'Työkohteessa vain yksi ajokaista käytössä': 'Only one lane open at the work site',
  'Yksi ajorata suljettu': 'One carriageway closed',
  'Toinen ajorata suljettu liikenteeltä': 'One carriageway closed',
  'Toinen ajorata on suljettu liikenteeltä': 'One carriageway closed',
  'Liikenne ohjataan kaksisuuntaisena toiselle ajoradalle': 'Two-way traffic on one carriageway',
  'Poikkeavat kaistajärjestelyt': 'Changed lane layout',
  'Kevyen liikenteen väylä suljettu/kavennettu': 'Cycle/footpath closed or narrowed',
  'Tietä kavennettu luiskasortuman vuoksi': 'Road narrowed after a bank collapse',
  // traffic flow and arrangements
  'Liikennejärjestelyt ovat muuttuneet': 'Changed traffic arrangements',
  'Muuttuneet liikennejärjestelyt': 'Changed traffic arrangements',
  'Liikenne ruuhkautuu': 'Congestion',
  'Liikenne saattaa ruuhkautua': 'Congestion possible',
  'Liikenne on jonoutunut': 'Queues',
  'Liikenne on hidasta': 'Slow traffic',
  'Liikenne pysähtelee': 'Stop-and-go traffic',
  'Liikenne seisoo': 'Traffic at a standstill',
  'Liikenne pysäytetään': 'Traffic will be stopped',
  'Liikenne pysäytetään ajoittain': 'Traffic stopped at times',
  'Liikenne on pysäytetty ajoittain': 'Traffic stopped at times',
  'Pysäytykset ja sulut voimassa': 'Stoppages and closures in force',
  'Liikenne sujuu normaalisti': 'Traffic flowing normally',
  'Liikenne on palautumassa normaaliksi': 'Traffic returning to normal',
  'Liikenne ohjataan vuorotellen tapahtumapaikan ohi': 'Alternating traffic past the scene',
  'Kohtaava liikenne, ajo vuorotellen ohjauksen mukaan': 'Alternating one-lane traffic under control',
  'Kiertotie käytössä': 'Detour in use',
  'Tapahtumapaikalla on käytössä kiertotie': 'Detour around the scene',
  'Paikalla on kiertotieopastus': 'Detour signposted',
  'Katuverkkoa käyttävä kiertotie': 'Detour via city streets',
  'Kiertotien mutkat ovat jyrkkiä': 'Sharp bends on the detour',
  'Kiertotien pinta on mursketta': 'Gravel surface on the detour',
  'Kiertotien pinta on päällystetty': 'Paved surface on the detour',
  'Tien pinta on mursketta': 'Gravel road surface',
  'Tien pinta on päällystetty': 'Paved road surface',
  'Paikalla tilapäinen liikennevalo-ohjaus': 'Temporary traffic lights',
  'Tilapäinen liikennevalo-ohjaus': 'Temporary traffic lights',
  'Tilapäinen nopeusrajoitus': 'Temporary speed limit',
  'Liikennevalot eivät toimi': 'Traffic lights out of order',
  'Automaattinen kameravalvonta käytössä': 'Speed cameras in use',
  'Työkoneita liikenteen seassa': 'Work machines among traffic',
  'Työmaa-ajoa liikenteen seassa': 'Site traffic among traffic',
  'Raskaan ajoneuvon nostotyö': 'Heavy lifting work',
  // accidents and hazards
  'Onnettomuus, jossa on mukana linja-auto': 'Accident involving a bus',
  'Onnettomuus, jossa on mukana raskas ajoneuvo': 'Accident involving a heavy vehicle',
  'Onnettomuus, jossa on mukana vaarallisia aineita': 'Accident involving dangerous goods',
  'Onnettomuus, jossa raskas ajoneuvo on kaatunut tielle': 'Overturned heavy vehicle',
  'Onnettomuuspaikan pelastus- ja raivaustyöt käynnissä': 'Rescue and clearance under way',
  'Ajoneuvojen lukumäärä': 'Number of vehicles',
  'Mukana olevien ajoneuvojen lukumäärä': 'Vehicles involved',
  'Mukana olevien ajoneuvoyhdistelmien lukumäärä': 'Vehicle combinations involved',
  'Palava ajoneuvo tiellä': 'Burning vehicle on the road',
  'Rikkoutunut ajoneuvo tiellä': 'Broken-down vehicle on the road',
  'Rikkoutunut raskas ajoneuvo tiellä': 'Broken-down heavy vehicle on the road',
  'Vaaraa aiheuttava ajoneuvo tai kuljetus tiellä': 'Hazardous vehicle or transport on the road',
  'Ajoneuvo liikkuu väärällä ajoradalla': 'Wrong-way driver',
  'Siirrettävä ajoneuvo': 'Vehicle to be towed',
  'Kuorma on levinnyt tielle': 'Spilled load on the road',
  'Liikennettä vaarantava este tiellä': 'Dangerous obstruction on the road',
  'Tiellä on este, joka saattaa vaarantaa liikennettä': 'Obstruction on the road',
  'Puu/puita on kaatunut tielle': 'Fallen trees on the road',
  'Sähköjohto on pudonnut tielle': 'Power line down on the road',
  'Sähköjohto pudonnut tielle': 'Power line down on the road',
  'Eläimiä tiellä': 'Animals on the road',
  'Hirviä tiellä': 'Moose on the road',
  'Poroja tiellä': 'Reindeer on the road',
  'Polttoainetta tiellä': 'Fuel on the road',
  'Öljyä tiellä': 'Oil on the road',
  'Savea tiellä': 'Clay on the road',
  'Irtohiekkaa tiellä': 'Loose sand on the road',
  'Irtokiviä tiellä': 'Loose stones on the road',
  'Tielle on vuotanut nestettä liikkuvasta ajoneuvosta': 'Fluid leaked on the road',
  'Vettä tiellä': 'Water on the road',
  'Tulvavesi on noussut tielle': 'Flooded road',
  'Tie on sortunut': 'Road collapsed',
  'Tie tai tien reuna on painunut': 'Road or verge subsided',
  'Tienpinta on huonossa kunnossa': 'Poor road surface',
  // weather and visibility
  'Huono ajokeli': 'Poor driving conditions',
  'Erittäin huono ajokeli': 'Very poor driving conditions',
  'Tiet ovat jäisiä': 'Icy roads',
  'Tiet ovat jäisiä ja märkiä': 'Icy and wet roads',
  'Tiet ovat jäätymässä': 'Roads freezing',
  'Märät tienpinnat saattavat jäätyä': 'Wet roads may freeze',
  'Mustaa jäätä tiellä': 'Black ice',
  'Lunta tiellä': 'Snow on the road',
  'Uutta lunta tiellä': 'Fresh snow on the road',
  'Lumisohjoa tiellä': 'Slush on the road',
  'Lumi- ja jääpolannetta tiellä': 'Packed snow and ice on the road',
  'Jäätävää sadetta': 'Freezing rain',
  'Jäätävä sumu tai sade vaikeuttaa liikennettä': 'Freezing fog or rain',
  'Räntäsade vaikeuttaa liikennettä': 'Sleet',
  'Lumisade heikentää näkyvyyttä': 'Snowfall reduces visibility',
  'Sakea lumisade heikentää näkyvyyttä': 'Heavy snowfall reduces visibility',
  'Lumimyrsky heikentää näkyvyyttä': 'Blizzard reduces visibility',
  'Pöllyävä lumi heikentää näkyvyyttä': 'Blowing snow reduces visibility',
  'Vesisade heikentää näkyvyyttä': 'Rain reduces visibility',
  'Roiskevesi haittaa näkyvyyttä': 'Spray reduces visibility',
  'Sumu heikentää näkyvyyttä': 'Fog reduces visibility',
  'Sakea sumu heikentää näkyvyyttä': 'Dense fog',
  'Paikoittainen sumu heikentää näkyvyyttä': 'Patchy fog',
  'Savu heikentää näkyvyyttä': 'Smoke reduces visibility',
  'Näkyvyys on heikentynyt': 'Reduced visibility',
  'Kova tuuli vaikeuttaa liikennettä': 'Strong wind',
  'Kova sivutuuli vaikeuttaa liikennettä': 'Strong crosswind',
  'Puuskittainen tuuli haittaa liikennettä': 'Gusty wind',
  'Myrskytuuli vaikeuttaa liikennettä': 'Storm-force wind',
  'Kevyen liikenteen väylillä on lunta': 'Snow on cycle/footpaths',
  'Kevyen liikenteen väylät ovat jäisiä ja liukkaita': 'Icy cycle/footpaths',
  'Kevyen liikenteen väylät ovat jäätymässä': 'Cycle/footpaths freezing',
  // ferries
  'Lautan kantavuus on muuttunut': 'Ferry load limit changed',
  'Lauttaliikenne on keskeytetty': 'Ferry service suspended',
  'Lauttaliikenne keskeytetään huoltotyön ajaksi': 'Ferry suspended for maintenance',
  'Lauttaliikenne keskeytetään huonon sään vuoksi': 'Ferry suspended due to weather',
  'Lauttaliikenne keskeytetään puutavaran uiton vuoksi': 'Ferry suspended for timber floating',
  'Lauttaliikenteessä esiintyy tilapäisiä katkoksia': 'Temporary ferry interruptions',
  'Lauttaliikenteessä on tilapäisiä aikataulumuutoksia': 'Temporary ferry timetable changes',
  // other
  'Tilapäinen toimintahäiriö': 'Temporary malfunction',
  'Poissa käytöstä': 'Out of use',
};

const AREAS_EN: Record<string, string> = {
  'Maan eteläosa': 'southern Finland',
  'Maan keskiosa': 'central Finland',
  'Maan pohjoisosa': 'northern Finland',
};

/** "name" or "name: value"; English from the table above, else the Finnish original. */
export function featureText(lang: Lang, f: string): string {
  if (lang === 'fi') return f.replace(/: (\d+)\.(\d+)/, ': $1,$2');
  const m = /^(.*?): (.+)$/.exec(f);
  return m ? `${EN[m[1]] ?? m[1]}: ${m[2]}` : (EN[f] ?? f);
}

/** "Tie 56, Jämsä" -> "Road 56, Jämsä"; "Tie 103, eli Vuosaaren satamatie, Helsinki" -> "Road 103 (Vuosaaren satamatie), Helsinki" */
export function titleText(lang: Lang, t: string): string {
  if (lang === 'fi') return t;
  const en = t
    .replace(/^Tie (\d+), eli ([^,]+)/, 'Road $1 ($2)')
    .replace(/^Tie (\d+)/, 'Road $1')
    .replace(/Maan (etelä|keski|pohjois)osa/g, (m) => AREAS_EN[m] ?? m);
  return en.charAt(0).toUpperCase() + en.slice(1);
}

export const KIND_COLOR: Record<TrafficMessage['kind'], string> = {
  accident: '#ff3b3b',
  closed: '#ff9a1f',
  lane: '#ffd800',
  other: '#8fb4ff',
};
