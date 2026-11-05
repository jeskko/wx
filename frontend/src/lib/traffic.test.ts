import { describe, expect, it } from 'vitest';
import { featureText, titleText } from './traffic';

describe('traffic announcement texts', () => {
  it('translates known features, keeps unknown ones and values', () => {
    expect(featureText('en', 'Tie on suljettu liikenteeltä')).toBe('Road closed');
    expect(featureText('en', 'Tilapäinen nopeusrajoitus: 60')).toBe('Temporary speed limit: 60');
    expect(featureText('en', 'Jotain uutta')).toBe('Jotain uutta');
    expect(featureText('fi', 'Tie on suljettu liikenteeltä')).toBe('Tie on suljettu liikenteeltä');
  });
  it('turns road titles into English', () => {
    expect(titleText('en', 'Tie 56, Jämsä')).toBe('Road 56, Jämsä');
    expect(titleText('en', 'Tie 103, eli Vuosaaren satamatie, Helsinki')).toBe('Road 103 (Vuosaaren satamatie), Helsinki');
    expect(titleText('en', 'Maan keskiosa, Maan pohjoisosa')).toBe('Central Finland, northern Finland');
    expect(titleText('fi', 'Tie 56, Jämsä')).toBe('Tie 56, Jämsä');
  });
});
