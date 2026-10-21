# Orion Custom Model Training & Kaggle Dataset Hub

This directory contains the end-to-end training suite to fine-tune your own local LLM (e.g. **LLaMA 3.2 3B/8B**, **Qwen 2.5 7B**, or **Mistral 7B**) for grounded RAG and dual-speaker podcast generation without relying on any external APIs.

---

## 1. Verified Kaggle Datasets

You can download datasets directly via Kaggle or using `training/download_kaggle_data.py`:

| Task | Dataset Name | Kaggle Link | Description |
| :--- | :--- | :--- | :--- |
| **Grounded QA & RAG** | **SQuAD 2.0** | [Stanford Question Answering Dataset](https://www.kaggle.com/datasets/stanfordu/stanford-question-answering-dataset) | 100k+ question-context-answer triples with unanswerable questions to eliminate hallucination. |
| **Document Summarization** | **News Summary** | [News Summary (Inshorts)](https://www.kaggle.com/datasets/sunnysai12345/news-summary) | 45k+ high-density news articles and human summaries for executive briefing training. |
| **Long-Form Synthesis** | **CNN/DailyMail** | [CNN/DailyMail Summarization](https://www.kaggle.com/datasets/gowrishankarp/newspaper-text-summarization-cnn-dailymail) | 300k+ complex multi-paragraph articles paired with bulleted takeaways. |
| **Audio Deep Dive** | **DialogSum / SAMSum** | [DialogSum on Hugging Face](https://huggingface.co/datasets/knkarthick/dialogsum) | 13k+ multi-turn dialogues for training Host A & Host B conversational interaction. |

---

## 2. Quickstart Training Pipeline

### Step 1: Install Training Dependencies
```bash
pip install torch transformers peft trl datasets bitsandbytes accelerate
```

### Step 2: Download & Prepare Kaggle Data
```bash
python training/download_kaggle_data.py --dataset squad --output_dir ./training/data
python training/prepare_dataset.py --input_file ./training/data/squad_raw.json --output_file ./training/data/orion_train.jsonl
```

### Step 3: Launch 4-Bit QLoRA Fine-Tuning
```bash
python training/train_lora_orion.py \
  --base_model unsloth/Llama-3.2-3B-Instruct \
  --train_data ./training/data/orion_train.jsonl \
  --output_dir ./models/orion-lora \
  --epochs 3 \
  --batch_size 4
```

### Step 4: Export to Ollama for Zero-API Local Inference
```bash
python training/export_gguf.py --lora_dir ./models/orion-lora --output_model ./models/orion.gguf
ollama create orion:custom -f training/Modelfile
```

Once registered in Ollama, launch Orion and select `orion:custom` in the Settings modal!
