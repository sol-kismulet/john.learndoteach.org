\version "2.24.0"

%% Bach Cello Suite No. 1, Allemande (BWV 1007). Absolute-octave source so
%% each measure is self-contained (no \relative drift when slicing per loop).
allemande = \absolute {

  \time 2/2
  \key g \major
  \set Staff.midiInstrument = "cello"

  %% Beam sixteenths in groups of four (2/2 would otherwise beam them in eights).
  \set Timing.baseMoment = #(ly:make-moment 1/16)
  \set Timing.beatStructure = #'(4 4 4 4)

  \repeat volta 2 {
    \partial 16 b16\f |
    <b d g,>4 << { b16\repeatTie a16-4( g16 fis16) } \\ { d16\repeatTie s8. } >> g16 d16( e16 fis16 g16 a16 b16 c'16) |
    d'16( b16 g16 fis16 g16 e16 d16 c16) \stemUp b,16( c16 d16 e16 \stemNeutral fis16 g16 a16-1 b16) |
    c'16( a16 g16 fis16 g16 e16 fis16 g16) a,16 d16( fis16 g16 a16-1 b16 c'16 a16) |
    b16( g16) g16( d16) d16( b,16) b,16( g,16) g,8.\downbow b16\upbow c'16( b16 a16) g16 |
    \barNumberCheck #5
    a16-1( b16 c'16) a16 g16-2( fis16 g16) a16 dis8.\trill c'16-4 b16 a16 g16 fis16 |
    g16 e16 e16 b,16 b,16 g,16 g,16 e,16 e,8. b,16 e16 g16 fis16 a16 |
    g16 fis16 e16 fis16 g16 cis'16 g16 fis16 g16 cis'16 e16 fis16 g16 e16 a,16 g16 |
    fis8 d16 e16 fis16 d16 g16 e16 fis16 d16 fis16 g16 a16 b16 c'16 a16 |
    b16 d16 g,16 d16 b16 g16 a16 fis16 g16 e16 g16 a16 b16 cis'16 d'16 b16 |
    \barNumberCheck #10
    cis'16 e16 g,16 e16 cis'16 a16 b16 d'16 cis'16 a16 d'16 b16 cis'16 a16 e'16 g16 |
    fis8.\trill d'16 a16 g16 fis16 e16 d16 a16 g16 e16 fis16 d16 a16 c16 |
    b,8.\trill g16 d16 c16 b,16 a,16 g,16 d16 c16 a,16 b,16 g,16 d16 fis,16 |
    e,16 g,16 a,16 b,16 cis16 d16 e16 fis16 g16 a16 cis'16 d'16 e'16 a16 g'8 |
    d16 g'16 fis'16 e'16 fis'16 d'16 a16 d'16 d16 fis16 a16 c'16 b8.\trill a16 |
    \barNumberCheck #15
    <g, d b>8. a16 g16 fis16 e16 d'16 cis'16 e'16 a16 g16 fis16 d16 a,16 cis16 |
    d,8. a,16 d16 fis16 a16 cis'16 d'16 a16 fis16 d16 d,8.
  }

  \repeat volta 2 {
    a16 |
    <d a>4 ~ <d a>16 fis16 g16 a16 d16 e16 fis16 g16 a16 fis16 d16 c16 |
    b,16 d16 g16 fis16 g16 a16 b16 c'16 d'16 b16 a16 g16 f16 e16 f16 d'16 |
    e8\trill \appoggiatura d8 c8 c'16 a,16 b,16 c16 d,16 c'16 b16 c'16 d'16 b16 c'16 a16 |
    \barNumberCheck #20
    gis8\trill e8 b16 d16 c16 b,16 c16 e16 fis16 gis16 a16 c'16 b16 a16 |
    d'8 b,16 c16 d16 e16 f16 a,16 gis,8.\trill e16 b16 d'16 c'16 b16 |
    <a, e c'>8. b16 a16 g16 f16 e16 f16 d16 bes16 a16 bes16 c'16 d'16 a16 |
    gis16 a16 b16 e16 f16 d16 c16 b,16 c16 e16 a16 b16 <e b>8. a16 |
    <a, e a>8. b16 c'16 b16 c'16 g16 fis16 g16 a16 e16 d16 c16 b,16 a,16 |
    \barNumberCheck #25
    g,16 d16 fis16 c'16 b16 a16 g16 a16 b16 c'16 d'16 e'16 d'16 e'16 f'16 d'16 |
    e'8 g8 c16 d'16 c'16 b16 a16 b16 c'16 e'16 d'8. c'16 |
    d'8 a8 b,16 c'16 b16 a16 g16 fis16 e16 g16 b16 d'16 c'16 b16 |
    c'8 g8 a,16 e16 fis16 g16 fis16 a16 b16 c'16 d16 c16 b,16 a,16 |
    g,16 d16 fis16 a16 c'16 a16 fis16 d16 <g, d b>8. d16 e16 g16 a16 cis'16 |
    \barNumberCheck #30
    d'16 a16 fis16 e16 d16 f16 g16 b16 c'16 g16 e16 d16 c16 e16 a16 c'16 |
    fis16 a16 c'16 e'16 d'8. c16 b,16 g16 a,16 g,16 d,16 a,16 g16 fis16 |
    g16 g,16 b,16 d16 g16 b16 d'16 fis'16 g'16 d'16 b16 g16 g,8. s16
  }
}
