let generatedChords = [];

function MelodyPlay() {
    const text = document.getElementById('melodyInput').value;
    const notes = text.trim().split(" ");

    const synth = new Tone.Synth().toDestination();
    Tone.Transport.bpm.value = 120;
    let now = Tone.now();
    notes.forEach((note, index)=>{
        if(note !== "br") {
            synth.triggerAttackRelease(note, "4n",now+index * 0.5);
        }
        //"br"の場合は休符として扱う
    });
}

function ChordGenerate() {
  const input = document.getElementById("melodyInput").value.trim().split(" ");
  const chordMap = {
    'C': ['C4', 'E4', 'G4'],
    'D': ['D4', 'F4', 'A4'],
    'E': ['E4', 'G4', 'B4'],
    'F': ['F4', 'A4', 'C5'],
    'G': ['G4', 'B4', 'D5'],
    'A': ['A4', 'C5', 'E5'],
    'B': ['B4', 'D5', 'F5']
  };

  generatedChords = [];
  const measures = [];
  for (let i = 0; i < input.length; i += 4) {
    measures.push(input.slice(i, i + 4));
  }

  const outputDiv = document.getElementById("chordOutput");
  outputDiv.innerHTML = "";

  measures.forEach((measure, index) => {
    const rootNote = measure.find(n=> n !== "br");
    const root = rootNote.slice(0, -1); // "C4" → "C"
    const chord = chordMap[root] || ['C4', 'E4', 'G4'];
    generatedChords.push(chord);
    outputDiv.innerHTML += `<p>小節${index + 1}: ${chord.join(", ")}</p>`;
  });
}

function PlayAll() {
  const melodyInput = document.getElementById("melodyInput").value.trim();
  const melodyNotes = melodyInput.split(" ");
  const melodySynth = new Tone.Synth().toDestination();
  const chordSynth = new Tone.PolySynth().toDestination();

  chordSynth.volume.value = -10; // コードの音量を下げる

  Tone.Transport.bpm.value = 120;
  Tone.Transport.cancel();
  Tone.Transport.stop();
  Tone.Transport.seconds = 0;

  // メロディ再生（0.5秒間隔）
  melodyNotes.forEach((note, index) => {
    if(note !== "br"){
      Tone.Transport.scheduleOnce((time) => {
        melodySynth.triggerAttackRelease(note, "4n", time);
      }, index * 0.5);
    }
    //"br"の場合は休符として扱う
  });

  // コード再生（2秒間隔）
  generatedChords.forEach((chord, index) => {
    Tone.Transport.scheduleOnce((time) => {
      chordSynth.triggerAttackRelease(chord, "1n", time);
    }, index * 2);
  });

  Tone.Transport.start();
}