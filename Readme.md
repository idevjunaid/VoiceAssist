# Drupal AI Voice Node Creator

An AI-powered voice assistant module for Drupal that enables hands-free content creation using speech. It dynamically detects form fields, supports paragraph and multi-value fields, and uses AI to interpret and fill values — all through voice interaction.

---

## 🚀 Features

- 🎙️ Voice-based node creation experience
- 🧠 AI-powered field value interpretation
- 🧩 Supports Paragraph fields with dynamic add flow
- ➕ Handles multi-value fields with "Add another item" logic
- 📋 Smart form field detection and processing
- 🧼 Clean UI integration, no intrusive interface
- 🔁 Field-by-field processing with AI question flow
- ✅ Compatible with Drupal 10 and 11

---

## 🛠️ Installation

1. Place the module in your Drupal `/modules/custom` directory:
   ```
   /modules/custom/drupal_ai_voice_node_creator
   ```

2. Enable the module via:
   ```
   drush en drupal_ai_voice_node_creator
   ```
   Or through the Drupal admin interface.

3. Make sure the following settings are configured:
   - `drupalSettings.voice_assist` is available
   - Your endpoints for voice and AI interpretation are reachable:
     - `/voice-assist/voice` (Text-to-Speech)
     - `/voice-assist/ai` (AI question/interpret)

---

## ⚙️ Configuration

The module expects two endpoints:
- `POST /voice-assist/voice`  
  Handles converting AI questions to voice output.
  
- `POST /voice-assist/ai`  
  - `mode: "question"` → Generates AI question per field label  
  - `mode: "interpret"` → Interprets user’s spoken input for the current field

You can integrate ElevenLabs, OpenAI, or local speech APIs on your backend.

---

## 📂 File Structure

```
drupal_ai_voice_node_creator/
├── drupal_ai_voice_node_creator.info.yml
├── js/
│   └── voice_assist.js
├── drupal_ai_voice_node_creator.libraries.yml
├── voice_assist.routing.yml
├── voice_assist.controller.php
```

---

## 🧠 How It Works

1. On page load, the script collects all visible fields except submit buttons.
2. It uses AI to ask questions based on field labels.
3. User replies via voice; AI interprets and fills fields.
4. For multi-value/paragraph fields:
   - Asks if user wants to "add more"
   - If yes: adds and continues processing new fields
5. After all fields, it confirms and submits the form.

---

## 📢 Credits

Developed by [@idevjunaid](https://github.com/idevjunaid)  
Built with ❤️ for the Drupal dev community.

---

## 📜 License

MIT License – free to use, modify, and distribute.