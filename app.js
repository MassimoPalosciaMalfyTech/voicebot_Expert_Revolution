// app.js (versione pulita)

let conversationOn = false;
let pc = null;           // RTCPeerConnection
let dc = null;           // DataChannel
let audioElement = null; // For model's audio output

const toggleBtn = document.getElementById('toggleBtn');
const statusDiv = document.getElementById('status');
const transcriptDiv = document.getElementById('transcript');

// Funzione di ricerca su Excel (invariata)
async function cercaSulFileExcelEFormattaRisposta(id) {
  try {
    const res = await fetch('/ExpertChatBot_testPractices.xlsx');
    if (!res.ok) throw new Error('Download Excel fallito');
    const buf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const headers = ws.getRow(1).values.slice(1).map(h => String(h || '').trim());
    const col = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase()) + 1;
    const rd = (row, ...names) => {
      for (const n of names) {
        const i = col(n);
        if (i > 0) {
          const t = String(row.getCell(i).text || '').trim();
          if (t) return t;
        }
      }
      return '';
    };
    const idCol = col('id') || 1;
    let row = null;
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = String(ws.getRow(r).getCell(idCol).text || '').trim();
      if (v === String(id)) { row = ws.getRow(r); break; }
    }
    if (!row) return 'Pratica non trovata.';
    const step = Number(rd(row, 'step_status'));
    const join = (a,b) => [a,b].map(x=>x&&String(x).trim()).filter(Boolean).join(' - ') || 'contatto non disponibile';
    if (step === 0) return 'Pratica appena arrivata: parla con un operatore fisico.';
    if (step === 1) return 'Pratica in mano al gestore. Contatto: ' + join(rd(row,'Operator','Gestore'), rd(row,'OperatorCotact','GestoreContact')) + '.';
    if ([3,4,9].includes(step)) return 'Pratica in mano al perito. Contatto: ' + join(rd(row,'Expert','Perito'), rd(row,'ExprtCotact','ExpertContact')) + '.';
    if (step === 5) return 'Pratica in mano al controllore. Contatto: ' + join(rd(row,'Checker','Controllore'), rd(row,'ChecherContact','CheckerContact')) + '.';
    if (step === 7) return 'Pratica chiusa. Contatto liquidatore: ' + join(rd(row,'Liquidatore'), rd(row,'LiquidatoreContact')) + '.';
    return 'Impossibile applicare le regole: step_status mancante o non valido.';
  } catch (e) {
    return 'Errore lettura Excel: ' + e.message;
  }
}

// Helper per aggiornare la UI
function updateUI() {
  toggleBtn.textContent = conversationOn ? 'Turn Conversation OFF' : 'Turn Conversation ON';
  statusDiv.innerHTML = `Conversation is <b>${conversationOn ? 'ON' : 'OFF'}</b>`;
}

// Avvia la conversazione
async function startConversation() {
  const tokenResponse = await fetch("/token");
  const data = await tokenResponse.json();
  const EPHEMERAL_KEY = data.value;
  if (!EPHEMERAL_KEY) {
    alert("Failed to get ephemeral key from server.");
    return;
  }

  pc = new RTCPeerConnection();

  audioElement = document.createElement("audio");
  audioElement.autoplay = true;
  pc.ontrack = (e) => {
    audioElement.srcObject = e.streams[0];
    console.log("Received audio track from model.");
  };

  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(ms.getTracks()[0]);
    console.log("Microphone stream added to connection.");
  } catch (err) {
    alert('Could not access microphone: ' + err.message);
    return;
  }

  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => console.log("Data channel open");
  dc.onclose = () => console.log("Data channel closed");
  dc.onerror = (err) => console.error("Data channel error:", err);
  dc.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      console.log("Received event:", event);

      if (event.type === "response.done" && event.response && Array.isArray(event.response.output)) {
        for (const output of event.response.output) {
          if (output.type === "function_call" && output.name === "extract_info_from_excel") {
            const args = JSON.parse(output.arguments);
            const callId = output.call_id;
            const idPratica = args.id;
            appendToTranscript("agent", `[Ricerca in Excel per ID: "${idPratica}"]`);
            (async () => {
              try {
                const risultato = await cercaSulFileExcelEFormattaRisposta(idPratica);
                const functionCallOutput = {
                  type: "conversation.item.create",
                  item: { type: "function_call_output", call_id: callId, output: risultato }
                };
                console.log("INVIO RISULTATO FUNZIONE:", JSON.stringify(functionCallOutput, null, 2));
                dc.send(JSON.stringify(functionCallOutput));
                appendToTranscript("agent", `[Risultato trovato: ${risultato}]`);
                console.log("INVIO RICHIESTA DI RISPOSTA VOCALE");
                dc.send(JSON.stringify({ type: "response.create" }));
              } catch (error) {
                console.error("Errore durante l'esecuzione della ricerca Excel:", error);
                const errorOutput = {
                  type: "conversation.item.create",
                  item: { type: "function_call_output", call_id: callId, output: "Si è verificato un errore interno durante la ricerca." }
                };
                dc.send(JSON.stringify(errorOutput));
                dc.send(JSON.stringify({ type: "response.create" }));
              }
            })();
            return;
          }
        }
      }

      if (event.type === "response.output_audio_transcript.done" && event.transcript) {
        appendToTranscript("agent", event.transcript.trim());
        return;
      }

      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
        appendToTranscript("user", event.transcript.trim());
        return;
      }

    } catch (err) {
      console.error("Failed to parse event:", e.data);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const baseUrl = "https://api.openai.com/v1/realtime/calls";
  const model = "gpt-realtime";
  const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
    method: "POST",
    body: offer.sdp,
    headers: { Authorization: `Bearer ${EPHEMERAL_KEY}`, "Content-Type": "application/sdp" },
  });

  const answer = { type: "answer", sdp: await sdpResponse.text() };
  await pc.setRemoteDescription(answer);

  document.body.appendChild(audioElement);
  console.log("Conversation started.");
}

// Ferma la conversazione
function stopConversation() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (audioElement) {
    audioElement.remove();
    audioElement = null;
  }
  dc = null;
  console.log("Conversation stopped.");
}

// Gestore del pulsante ON/OFF
toggleBtn.addEventListener('click', async () => {
  conversationOn = !conversationOn;
  updateUI();
  if (conversationOn) {
    await startConversation();
  } else {
    stopConversation();
  }
});

// Helper per aggiungere testo alla trascrizione
function appendToTranscript(role, text) {
  if (!transcriptDiv || !text) return;
  const p = document.createElement('div');
  p.className = role === "agent" ? "transcript-assistant" : "transcript-user";
  p.textContent = (role === "agent" ? "Agent: " : "User: ") + text;
  transcriptDiv.appendChild(p);
  transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
}

// Aggiornamento iniziale della UI
updateUI();