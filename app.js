// app.js

let conversationOn = false;
let pc = null;           // RTCPeerConnection
let dc = null;           // DataChannel
let audioElement = null; // For model's audio output
let browserHelpActive = false; // Browser Help mode flag
let screenStream = null; // For screen capture in Browser Help mode

const toggleBtn = document.getElementById('toggleBtn');
const statusDiv = document.getElementById('status');
const video = document.getElementById('cameraPreview');
const captureBtn = document.getElementById('captureBtn');
const browserHelpBtn = document.getElementById('browserHelpBtn');
const capturedImage = document.getElementById('capturedImage');
const transcriptDiv = document.getElementById('transcript'); // For transcript display

// Buffer for user speech transcription
let userTranscriptBuffer = "";
let userTranscriptTimeout = null;
let lastAgentTranscript = "";


async function cercaSulFileExcelEFormattaRisposta(id) {
  try {
    // carica file
    const res = await fetch('/ExpertChatBot_testPractices.xlsx');
    if (!res.ok) throw new Error('Download Excel fallito');
    const buf = await res.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];

    // headers dalla riga 1
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
    if (step === 1) return 'Pratica in mano al gestore. Contatto: ' +
      join(rd(row,'Operator','Gestore'), rd(row,'OperatorCotact','GestoreContact')) + '.';
    if ([3,4,9].includes(step)) return 'Pratica in mano al perito. Contatto: ' +
      join(rd(row,'Expert','Perito'), rd(row,'ExprtCotact','ExpertContact')) + '.';
    if (step === 5) return 'Pratica in mano al controllore. Contatto: ' +
      join(rd(row,'Checker','Controllore'), rd(row,'ChecherContact','CheckerContact')) + '.';
    if (step === 7) return 'Pratica chiusa. Contatto liquidatore: ' +
      join(rd(row,'Liquidatore'), rd(row,'LiquidatoreContact')) + '.';

    return 'Impossibile applicare le regole: step_status mancante o non valido.';
  } catch (e) {
    return 'Errore lettura Excel: ' + e.message;
  }
}

// 1. Start camera preview on page load (webcam)
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    console.log("Camera stream started.");
  } catch (err) {
    alert('Could not access camera: ' + err.message);
    console.error("Camera error:", err);
  }
}
startCamera();

// 2. UI update helper
function updateUI() {
  toggleBtn.textContent = conversationOn ? 'Turn Conversation OFF' : 'Turn Conversation ON';
  statusDiv.innerHTML = `Conversation is <b>${conversationOn ? 'ON' : 'OFF'}</b>`;
  browserHelpBtn.textContent = browserHelpActive ? "Stop Browser Help" : "Start Browser Help";
}

// 3. Start conversation (WebRTC to OpenAI Realtime API)
async function startConversation() {
  // 1. Get ephemeral token from backend
  const tokenResponse = await fetch("/token");
  const data = await tokenResponse.json();
  console.log(data)
  const EPHEMERAL_KEY = data.value;
  if (!EPHEMERAL_KEY) {
    alert("Failed to get ephemeral key from server.");
    console.error("No ephemeral key received from /token endpoint.");
    return;
  }

  // 2. Create WebRTC peer connection
  pc = new RTCPeerConnection();

  // 3. Set up audio element to play model's voice
  audioElement = document.createElement("audio");
  audioElement.autoplay = true;
  pc.ontrack = (e) => {
    audioElement.srcObject = e.streams[0];
    console.log("Received audio track from model.");
  };

  // 4. Get mic and add to connection
  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(ms.getTracks()[0]);
    console.log("Microphone stream added to connection.");
  } catch (err) {
    alert('Could not access microphone: ' + err.message);
    console.error("Microphone error:", err);
    return;
  }

  // 5. Set up data channel for events
  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => console.log("Data channel open");
  dc.onclose = () => console.log("Data channel closed");
  dc.onerror = (err) => console.error("Data channel error:", err);
  dc.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      console.log("Received event:", event);

      // --- FUNCTION CALLING: Listen for function_call in response.done ---
      if (
        event.type === "response.done" &&
        event.response &&
        Array.isArray(event.response.output)
      ) {
        for (const output of event.response.output) {
          if (output.type === "function_call" && output.name === "web_search") {
            const args = JSON.parse(output.arguments);
            const callId = output.call_id;
            appendToTranscript("agent", `[Web search requested: "${args.query}"]`);

            // Example: Call your backend to perform the web search
            fetch(`/websearch?query=${encodeURIComponent(args.query)}`)
              .then(res => res.json())
              .then(result => {
                // Send the result back as a function_call_output
                const functionCallOutput = {
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify({ result: result.snippet || result.summary || JSON.stringify(result) })
                  }
                };
                dc.send(JSON.stringify(functionCallOutput));
                // Optionally, trigger a new response
                dc.send(JSON.stringify({ type: "response.create" }));
                appendToTranscript("agent", `[Web search result: ${result.snippet || result.summary || JSON.stringify(result)}]`);
              })
              .catch(err => {
                const errorMsg = "Web search failed: " + err.message;
                appendToTranscript("agent", errorMsg);
              });
            return;
          }
          if(output.type === "function_call" && output.name === "extract_info_from_excel"){
            
            const args = JSON.parse(output.arguments);
            const callId = output.call_id; // VERIFICA CHE SIA 'call_id'
            const idPratica = args.id;

            appendToTranscript("agent", `[Ricerca in Excel per ID: "${idPratica}"]`);

            (async () => {
                try {
                    // Esegui la tua funzione per ottenere la stringa di risposta
                    const risultato = await cercaSulFileExcelEFormattaRisposta(idPratica);

                    // 1. Prepara il pacchetto con il risultato della funzione
                    const functionCallOutput = {
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output", // Nome corretto dell'evento
                            call_id: callId,
                            output: risultato
                        }
                    };

                    // Invia il risultato al modello
                    console.log("INVIO RISULTATO FUNZIONE:", JSON.stringify(functionCallOutput, null, 2));
                    dc.send(JSON.stringify(functionCallOutput));
                    appendToTranscript("agent", `[Risultato trovato: ${risultato}]`);

                    // 2. ORA, chiedi esplicitamente al modello di generare una nuova risposta.
                    //    Questo è il trigger che lo fa parlare. Usa 'response.create' con il punto.
                    console.log("INVIO RICHIESTA DI RISPOSTA VOCALE");
                    dc.send(JSON.stringify({ type: "response.create" })); // VERIFICA CHE SIA 'response.create'

                } catch (error) {
                    console.error("Errore durante l'esecuzione della ricerca Excel:", error);

                    // Gestione dell'errore (se la ricerca fallisce)
                    const errorOutput = {
                        type: "conversation.item.create",
                        item: {
                            type: "function_call_output", // Nome corretto dell'evento
                            call_id: callId,
                            output: "Si è verificato un errore interno durante la ricerca della pratica."
                        }
                    };
                    // Invia il messaggio di errore al modello
                    dc.send(JSON.stringify(errorOutput));
                    
                    // Chiedi comunque al modello di parlare, così può dire che c'è stato un errore
                    dc.send(JSON.stringify({ type: "response.create" }));
                }
              })();
              
              // Interrompi l'ulteriore elaborazione di questo evento
              return;
          }
        }
      }

      // --- AGENT speech: ONLY log this event type ---
      if (
        event.type === "response.output_audio_transcript.done" &&
        event.transcript
      ) {
        appendToTranscript("agent", event.transcript.trim());
        return;
      }

      // --- USER speech: ONLY log this event type ---
      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        event.transcript
      ) {
        const userText = event.transcript.trim();
        appendToTranscript("user", userText);

        // Trigger screenshot if user says the magic phrase and browser help is active
        if (
          browserHelpActive &&
          (
            userText.toLowerCase().includes("what do you see now") ||
            userText.toLowerCase().includes("take this screen")
          )
        ) {
          sendCurrentFrameAsImage(screenStream, true);
        }
        return;
      }

      // --- Agent messages (text only, no audio transcript) ---
      if (event.item && event.item.type === "message" && event.item.role === "assistant" && event.item.content) {
        const textContent = event.item.content
          .filter(c => c.type === "output_text" && c.text)
          .map(c => c.text)
          .join(" ");
        if (textContent) {
          appendToTranscript("agent", textContent);
        }
        return;
      }

      // --- User text messages (if you ever send them) ---
      if (event.item && event.item.type === "message" && event.item.role === "user" && event.item.content) {
        const textContent = event.item.content
          .filter(c => c.type === "output_text" && c.text)
          .map(c => c.text)
          .join(" ");
        if (textContent) {
          appendToTranscript("user", textContent);
        }
        return;
      }

      // --- Browser Help: Smart Screenshot Trigger (unchanged) ---
      if (
        browserHelpActive &&
        event.item &&
        event.item.type === "message" &&
        event.item.role === "assistant" &&
        event.item.content
      ) {
        const textContent = event.item.content
          .filter(c => c.type === "output_text" && c.text)
          .map(c => c.text.toLowerCase())
          .join(" ");
        if (textContent.includes("what do you see now") || textContent.includes("take a screenshot")) {
          sendCurrentFrameAsImage(screenStream, true);
        }
        return;
      }
    } catch (err) {
      console.error("Failed to parse event:", e.data);
    }
  };

  // 6. Start session (SDP offer/answer)
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const baseUrl = "https://api.openai.com/v1/realtime/calls";
  const model = "gpt-realtime";
  const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  });

  const answer = {
    type: "answer",
    sdp: await sdpResponse.text(),
  };
  await pc.setRemoteDescription(answer);

  // 7. Add audio element to page
  document.body.appendChild(audioElement);

  console.log("Conversation started.");
}

// 4. Stop conversation
function stopConversation() {
  if (pc) {
    pc.close();
    pc = null;
    console.log("Peer connection closed.");
  }
  if (audioElement) {
    audioElement.remove();
    audioElement = null;
    console.log("Audio element removed.");
  }
  dc = null;
  if (browserHelpActive) {
    stopBrowserHelp();
  }
  console.log("Conversation stopped.");
}

// 5. Conversation ON/OFF button handler
toggleBtn.addEventListener('click', async () => {
  conversationOn = !conversationOn;
  updateUI();
  if (conversationOn) {
    await startConversation();
  } else {
    stopConversation();
  }
});

// 6. Capture button handler (image only, no text, webcam only)
captureBtn.addEventListener('click', () => {
  sendCurrentFrameAsImage(null, false);
  appendToTranscript("user", "[Image Sent]");
});

// 7. Browser Help Mode: Start/Stop screen sharing, NO interval!
browserHelpBtn.addEventListener('click', () => {
  if (!browserHelpActive) {
    startBrowserHelp();
  } else {
    stopBrowserHelp();
  }
  updateUI();
});

/**
 * Sends the current video frame as an image to the model.
 * If a stream is provided, uses that; otherwise uses webcam.
 * If fromBrowserHelp is true, appends "[Image Sent]" to transcript.
 */
function sendCurrentFrameAsImage(streamOverride, fromBrowserHelp = false) {
  const srcStream = streamOverride || video.srcObject;
  const videoTrack = srcStream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(videoTrack);

  imageCapture.grabFrame().then(bitmap => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

    capturedImage.src = dataUrl;
    capturedImage.style.display = 'block';

    if (dc && dc.readyState === "open") {
      const event = {
        type: "conversation.item.create",
        previous_item_id: null,
        item: {
          type: "message",
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl }
          ]
        }
      };
      console.log("Sending image event:", event);
      dc.send(JSON.stringify(event));
      if (fromBrowserHelp) {
        appendToTranscript("user", "[Image Sent]");
      }
    } else {
      if (!browserHelpActive) {
        alert("Conversation is not active or data channel not open.");
        console.warn("Tried to send image but data channel is not open.");
      }
    }
  }).catch(err => {
    console.error("Failed to capture frame:", err);
  });
}

/**
 * Starts Browser Help mode: asks for screen share.
 */
async function startBrowserHelp() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    video.srcObject = screenStream; // Show screen in preview
    browserHelpActive = true;
    console.log("Browser Help mode (screen) started.");
    updateUI();
  } catch (err) {
    alert('Could not access screen: ' + err.message);
    console.error("Screen capture error:", err);
  }
}

/**
 * Stops Browser Help mode and reverts to webcam.
 */
function stopBrowserHelp() {
  browserHelpActive = false;
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  startCamera();
  console.log("Browser Help mode stopped.");
  updateUI();
}

/**
 * Appends a message to the transcript panel, chat style.
 */
function appendToTranscript(role, text) {
  if (!transcriptDiv || !text) return;
  const p = document.createElement('div');
  p.className = role === "agent" ? "transcript-assistant" : "transcript-user";
  p.textContent = (role === "agent" ? "Agent: " : "User: ") + text;
  transcriptDiv.appendChild(p);
  transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
}

// 8. Initial UI update
updateUI();