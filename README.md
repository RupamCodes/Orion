# Orion — Local AI Research Notebook & Audio Studio

> **100% Local RAG • Zero Cloud API Keys • Dual-Speaker Deep Dives • Verifiable Citations**

Orion is a privacy-first, editorial-grade AI research workspace inspired by Google's NotebookLM and OpenBookLM. It executes all vector retrieval, language modeling, study synthesis, and dual-host audio discussions directly on your machine.

---

## 🌟 Key Features

- 🔒 **Zero API Keys & 100% Offline**: Runs with local Ollama (`llama3.2`, `mistral`, `qwen2.5`, `phi3`) or standalone browser-native RAG.
- 📚 **Multi-Source Evidence Drawer**: Upload PDFs, Markdown documents, plain text, and custom research notes.
- 🎯 **Grounded In-Line Citations**: Direct clickable citation markers `[1]`, `[2]` linking back to source passages.
- 🎙️ **Studio Audio Deep Dives**: Dual-host dialogue podcast generator ("Alex" & "Sam") with real-time waveform visualization, playback controls, and synchronized transcript highlighting.
- 📝 **Editorial Study Workspace**: Instant Study Guides, Executive Briefings, FAQs, and Research Scratchpad with pinned citations.
- 🧠 **Kaggle Training Pipeline**: Complete QLoRA 4-bit fine-tuning scripts in `/training` to train your own local Orion model.

---

## 🚀 Quickstart

### 1. Launch Frontend
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Optional: Connect Local Ollama Daemon
```bash
ollama run llama3.2:3b
```
Orion will automatically detect and connect to Ollama at `http://localhost:11434`.

### 3. Optional: Run Local Python Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```

---

## 📊 Kaggle Datasets & Training Suite

See the full training documentation and scripts in [`training/README.md`](training/README.md).

- **SQuAD 2.0**: [Stanford Question Answering Dataset on Kaggle](https://www.kaggle.com/datasets/stanfordu/stanford-question-answering-dataset)
- **News Summary**: [Inshorts Summarization on Kaggle](https://www.kaggle.com/datasets/sunnysai12345/news-summary)
- **CNN/DailyMail**: [CNN/DailyMail News Text Summarization on Kaggle](https://www.kaggle.com/datasets/gowrishankarp/newspaper-text-summarization-cnn-dailymail)
- **DialogSum**: [DialogSum Corpus on Hugging Face](https://huggingface.co/datasets/knkarthick/dialogsum)
