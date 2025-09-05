# Project Overview: Realtime Vision & Voice Agent

## What This Project Does

This project is a browser-based demo of a **vision-enabled, voice-interactive AI agent** using the OpenAI Realtime API.  
It allows you to:

- **Have real-time voice conversations** with an AI assistant (speech-to-speech).
- **Send images from your webcam or screen** to the agent for multimodal understanding.
- **See a live transcript** of both your speech and the agent’s responses.
- **Use a “Browser Help” mode** that lets the agent see your screen (via screen capture) and answer questions about what’s visible.

---

## Key Features

- **WebRTC-based audio streaming** for low-latency, natural voice interaction.
- **Webcam capture**: Take a snapshot and send it to the agent for analysis.
- **Screen capture (Browser Help)**: Share your screen and let the agent guide you or answer questions about what’s on your screen.
- **Transcript panel**: See a chat-like log of the conversation, with user and agent messages clearly labeled and color-coded.
- **Simple, responsive UI**: All controls and transcript are available in a single-page web app.

---

## Project Structure
workflows/
└─ realtime_v1.1.1/
├─ index.html # Main HTML file (UI, layout, transcript panel)
├─ app.js # All frontend logic (WebRTC, transcript, capture, etc.)
├─ server.js # Simple Express server to serve static files and mint ephemeral OpenAI keys
├─ overview.md # (This file) Project overview and documentation
└─ ... # (Other versions, package.json, etc.)


### **Key Files**

- **index.html**  
  - Contains the UI: camera preview, capture buttons, browser help button, and transcript panel.
  - Uses flexbox to lay out controls and transcript side-by-side.

- **app.js**  
  - Handles all browser logic:
    - Starts/stops the conversation (WebRTC connection to OpenAI).
    - Streams audio to/from the agent.
    - Captures webcam or screen images and sends them to the agent.
    - Buffers and displays user speech as a single message per segment.
    - Displays agent responses and user actions in the transcript.
    - Handles browser help mode (screen sharing and smart screenshot triggers).

- **server.js**  
  - Simple Node.js/Express server.
  - Serves static files (HTML, JS, CSS).
  - Provides a `/token` endpoint to mint ephemeral OpenAI API keys (so your real API key is never exposed to the browser).

---

## How It Works

1. **Start the server** (`node server.js`) and open the app in your browser.
2. **Turn Conversation ON** to start a WebRTC session with the OpenAI Realtime API.
3. **Talk to the agent**—your speech is transcribed and sent to the model, and the agent’s voice is streamed back.
4. **Capture an image** from your webcam or share your screen (Browser Help) to let the agent “see” and answer questions about what’s visible.
5. **Transcript panel** shows a running log of the conversation, with user and agent messages clearly labeled.

---

## UI Overview

- **Left side:** Camera preview, capture buttons, browser help button.
- **Right side:** Transcript panel (chat log).

---

## Customization & Extensibility

- You can easily add new features (e.g., file upload, text input, more agent controls) by editing `index.html` and `app.js`.
- The transcript logic can be extended to support more message types or richer formatting.
- The server can be extended for authentication, logging, or more advanced API key management.

---

## Requirements

- Node.js (for the server)
- A valid OpenAI API key (set in `.env` as `REALTIME_API_KEY`)
- Modern browser with WebRTC and screen capture support

---

## Further Reading

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [WebRTC API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Media Capture and Streams API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API)

---

**This project is a great starting point for building advanced, multimodal, real-time AI assistants in the browser!**