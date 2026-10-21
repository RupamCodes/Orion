'use client';

import React, { useState } from 'react';
import { 
  Database, 
  Terminal, 
  ExternalLink, 
  Copy, 
  Check, 
  Sparkles, 
  Cpu, 
  Layers, 
  FolderDown, 
  ArrowRight,
  ShieldCheck,
  Zap,
  BookOpen
} from 'lucide-react';

export const TrainingHub: React.FC = () => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const datasets = [
    {
      id: 'squad',
      title: 'Stanford Question Answering Dataset (SQuAD 2.0)',
      category: 'Grounded Reading Comprehension & RAG',
      kaggleUrl: 'https://www.kaggle.com/datasets/stanfordu/stanford-question-answering-dataset',
      description: 'The golden standard for extractive and grounded reading comprehension. 100k+ question-context-answer triples with unanswerable questions to train models to avoid hallucinations.',
      stats: '100,000+ QA pairs • Wikipedia Articles'
    },
    {
      id: 'news-summary',
      title: 'News Summary (Inshorts Dataset)',
      category: 'Document Summarization & Briefings',
      kaggleUrl: 'https://www.kaggle.com/datasets/sunnysai12345/news-summary',
      description: '45,000+ paired news articles with concise, high-density human editorial summaries. Ideal for training the Orion Briefing and Study Guide generator.',
      stats: '45,000+ Documents • High-Density Summaries'
    },
    {
      id: 'cnn-dailymail',
      title: 'CNN/DailyMail News Text Summarization',
      category: 'Long-Form Synthesis & Abstractive Summary',
      kaggleUrl: 'https://www.kaggle.com/datasets/gowrishankarp/newspaper-text-summarization-cnn-dailymail',
      description: '300,000+ complex multi-paragraph articles paired with multi-sentence bulleted takeaways. Perfect for large-context study guide training.',
      stats: '300,000+ Pairs • Multi-Bullet Synthesis'
    },
    {
      id: 'dialogsum',
      title: 'DialogSum / SAMSum Dialogue Corpus',
      category: 'Dual-Host Podcast & Conversational Reasoning',
      kaggleUrl: 'https://www.kaggle.com/datasets',
      hfIdentifier: 'knkarthick/dialogsum',
      description: '13,000+ multi-turn dialogues with conversational summaries and speaker turn structures. Used directly to train the Orion Audio Deep Dive (Alex & Sam) podcast generator.',
      stats: '13,000+ Dialogues • Multi-Speaker Turns'
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300">
          <Database className="w-3.5 h-3.5" />
          <span>Kaggle Dataset Hub & Custom Model Training</span>
        </div>
        <h1 className="editorial-title text-3xl md:text-4xl font-bold text-zinc-100 tracking-tight">
          Train Your Own Private Orion LLM
        </h1>
        <p className="text-sm md:text-base text-zinc-400 max-w-3xl leading-relaxed">
          Fine-tune a customized, low-latency open model (LLaMA 3.2, Qwen 2.5, or Mistral) on curated Kaggle datasets for grounded RAG and dual-speaker podcast generation without cloud API fees.
        </p>
      </div>

      {/* Kaggle Datasets Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2 font-mono uppercase tracking-wider">
            <Layers className="w-4 h-4 text-amber-400" />
            Curated Datasets for Orion
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {datasets.map((ds) => (
            <div
              key={ds.id}
              className="p-5 rounded-2xl bg-surface-card border border-surface-border hover:border-amber-500/40 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                    {ds.category}
                  </span>
                  <a
                    href={ds.kaggleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                  >
                    <span>Kaggle</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-amber-200 transition-colors mb-2">
                  {ds.title}
                </h3>

                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  {ds.description}
                </p>
              </div>

              <div className="pt-3 border-t border-surface-border/60 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span>{ds.stats}</span>
                {ds.hfIdentifier && (
                  <span className="text-zinc-400">HF: {ds.hfIdentifier}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* End-to-End Training Pipeline Workflow */}
      <div className="space-y-6">
        <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2 font-mono uppercase tracking-wider">
          <Terminal className="w-4 h-4 text-cyan-400" />
          Ready-to-Run Local Training Suite
        </h2>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-mono text-xs">
                  1
                </span>
                <span>Download & Format Datasets</span>
              </div>
              <button
                onClick={() => copyCode("python training/download_kaggle_data.py --dataset squad", "step1")}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 p-1 rounded bg-zinc-800"
              >
                {copiedSection === "step1" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Command
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Runs <code className="text-amber-400 font-mono">training/download_kaggle_data.py</code> to download SQuAD 2.0 and DialogSum, formatting them into standard Alpaca/ChatML JSONL instruction files.
            </p>
            <pre className="p-3 rounded-xl bg-zinc-950 font-mono text-xs text-zinc-300 overflow-x-auto border border-zinc-800">
              python training/download_kaggle_data.py --dataset squad --output_dir ./training/data
            </pre>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center justify-center font-mono text-xs">
                  2
                </span>
                <span>Launch QLoRA 4-bit Fine-Tuning (Local GPU or Kaggle Notebook)</span>
              </div>
              <button
                onClick={() => copyCode("python training/train_lora_orion.py --base_model unsloth/Llama-3.2-3B-Instruct --epochs 3", "step2")}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 p-1 rounded bg-zinc-800"
              >
                {copiedSection === "step2" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Command
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Uses HuggingFace PEFT / SFTTrainer with 4-bit quantization. Trains low-rank adapters on consumer GPUs (RTX 3060/4090 or Apple Metal MPS) with minimal VRAM (~6GB).
            </p>
            <pre className="p-3 rounded-xl bg-zinc-950 font-mono text-xs text-zinc-300 overflow-x-auto border border-zinc-800">
              python training/train_lora_orion.py --base_model unsloth/Llama-3.2-3B-Instruct --data_path ./training/data/rag_train.jsonl --output_dir ./models/orion-lora
            </pre>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center justify-center font-mono text-xs">
                  3
                </span>
                <span>Merge Adapters & Export to GGUF for Ollama</span>
              </div>
              <button
                onClick={() => copyCode("python training/export_gguf.py && ollama create orion:custom -f training/Modelfile", "step3")}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 p-1 rounded bg-zinc-800"
              >
                {copiedSection === "step3" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Command
              </button>
            </div>
            <p className="text-xs text-zinc-400">
              Merges weights and registers the custom Orion model directly into your local Ollama daemon for 100% offline, zero-API inference in the Orion workspace.
            </p>
            <pre className="p-3 rounded-xl bg-zinc-950 font-mono text-xs text-zinc-300 overflow-x-auto border border-zinc-800">
              python training/export_gguf.py --lora_dir ./models/orion-lora --output_model ./models/orion-q4.gguf
ollama create orion:custom -f training/Modelfile
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
