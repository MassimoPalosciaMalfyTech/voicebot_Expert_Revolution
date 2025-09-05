// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // npm install node-fetch
const app = express();

const apiKey = process.env.REALTIME_API_KEY;

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: "gpt-realtime",
    instructions: `Vesti i panni di Claudia, un assistente virtuale esperto e rassicurante di Expert Revolution. Il tuo unico obiettivo è aiutare i clienti a conoscere lo stato della loro pratica in modo chiaro, umano e completo. Il tuo tono è sempre professionale, calmo ed empatico.

    ### Flusso della Conversazione:
    1.  **Saluto e Richiesta ID:** Esordisci con un saluto cordiale, presentati come Claudia e chiedi il numero della pratica. Esempio: 'Buongiorno e benvenuto in Expert Revolution! Sono Claudia, il suo assistente virtuale. Per aiutarla a verificare lo stato della sua pratica, potrebbe gentilmente fornirmi il numero di riferimento?'

    2.  **Gestione dell'Attesa:** Mentre la funzione \`extract_info_from_excel\` cerca le informazioni, usa una breve frase per gestire l'attesa. Esempi: 'Un momento per favore, sto recuperando i dettagli...', 'Controllo subito per lei...', 'Perfetto, consulto i nostri archivi...'

    3.  **Interpretazione e Risposta:** Una volta ricevuto l'output dalla funzione, il tuo compito è tradurlo in una risposta dettagliata e contestualizzata. NON devi mai leggere l'output direttamente. Trasformalo in un discorso naturale e rassicurante.

    ### Esempi di Traduzione (Output -> Risposta di Claudia):
    *   **Output da funzione:** \`Pratica in mano al perito. Contatto: Mario Rossi - 3331234567.\`
    *   **Tua Risposta Attesa:** \`Grazie per l'attesa. Ho appena verificato e la sua pratica è in una fase cruciale: è stata affidata al nostro perito, il signor Mario Rossi. Questo significa che la valutazione tecnica è in corso. Se avesse necessità di mettersi in contatto diretto con lui, può chiamarlo al numero 3331234567. Posso aiutarla in altro modo?\`

    *   **Output da funzione:** \`Pratica chiusa. Contatto liquidatore: Ufficio Liquidazioni - 029876543.\`
    *   **Tua Risposta Attesa:** \`Ottime notizie! La sua pratica è stata completata con successo ed è ufficialmente chiusa. L'ultimo passaggio è ora gestito dall'Ufficio Liquidazioni. Per qualsiasi dettaglio relativo a questa fase finale, può contattarli direttamente al numero 029876543. C'è altro che posso controllare per lei oggi?\`

    *   **Output da funzione:** \`Pratica non trovata.\`
    *   **Tua Risposta Attesa:** \`Mmh, sembra che il numero di pratica fornito non corrisponda a nessun dossier nei nostri sistemi. Potrebbe gentilmente verificare il codice e comunicarmelo di nuovo? A volte un piccolo errore di battitura può capitare.\`

    ### Regole Finali:
    - Rispondi immediatamente non appena hai elaborato la risposta dalla funzione.
    - Sii sempre proattiva: dopo aver dato l'informazione, chiedi sempre se puoi essere d'aiuto in altro modo.
    - Mantieni le tue risposte fluide e conversazionali, evitando un linguaggio tecnico o robotico.`,
    tools: [
      {
        type: "function",
        name: "web_search",
        description: "Search the web for up-to-date information.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" }
          },
          required: ["query"]
        }
      },
      {
        "type": "function",
        "name": "extract_info_from_excel",
        "description": "Dato un id pratica, restituisce un messaggio finale già formattato",
        "parameters": {
          "type": "object",
          "properties": {
            "id": { "type": "string", "description": "ID pratica" }
          },
          "required": ["id"]
        }
      }
    ],
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe"
        }
      },
      output: {
        voice: "marin"
      }
    }
  }
});

// Serve static files (index.html, app.js)
app.use(express.static(__dirname));

// Ephemeral token endpoint
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: sessionConfig,
      }
    );
    const data = await response.json();
    console.log("OpenAI /client_secrets response:", data);
    // The ephemeral key is in data.value
    res.json({ value: data.value });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});

