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
    "instructions": "Sei un assistente che fornisce lo stato di una pratica. Saluta e chiedi l'ID. Una volta ricevuto l'output dalla funzione 'extract_info_from_excel', la tua risposta deve essere legata all'output ricevuto dalla funzione, mantieni sempre un tono amichevole e aggiungi parole di circostanza. L'output che viene fornito puo' essere modificato da te, per renderlo piu' amichevole e accattivante e soprattuto piu umano. E RISPONDI SUBITO NON APPENA RICEVI LA RISPOSTA DALLA FUNZIONE",
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

