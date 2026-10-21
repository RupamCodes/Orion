#!/usr/bin/env python3
"""
Orion Kaggle & Hugging Face Dataset Downloader
Downloads SQuAD 2.0, Inshorts News Summary, CNN/DailyMail, or DialogSum datasets.
"""
import os
import argparse
import json

def download_data(dataset_type: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    print(f"[*] Fetching dataset: {dataset_type} into {output_dir}")
    
    try:
        from datasets import load_dataset
        
        if dataset_type == "squad":
            print("[*] Loading SQuAD 2.0 (Stanford Question Answering Dataset)...")
            ds = load_dataset("rajpurkar/squad_v2")
            out_file = os.path.join(output_dir, "squad_train.json")
            ds["train"].to_json(out_file)
            print(f"[✓] Saved {len(ds['train'])} SQuAD QA samples to {out_file}")
            
        elif dataset_type == "dialogsum":
            print("[*] Loading DialogSum for Audio Podcast Training...")
            ds = load_dataset("knkarthick/dialogsum")
            out_file = os.path.join(output_dir, "dialogsum_train.json")
            ds["train"].to_json(out_file)
            print(f"[✓] Saved {len(ds['train'])} DialogSum samples to {out_file}")
            
        elif dataset_type == "news_summary":
            print("[*] Loading News Summary Dataset...")
            ds = load_dataset("cnn_dailymail", "3.0.0")
            out_file = os.path.join(output_dir, "cnn_dailymail_train.json")
            ds["train"].select(range(min(10000, len(ds["train"])))).to_json(out_file)
            print(f"[✓] Saved samples to {out_file}")
            
    except ImportError:
        print("[!] 'datasets' library not found. Creating sample mock dataset for local pipeline demonstration.")
        sample_data = [
            {
                "context": "Retrieval-Augmented Generation (RAG) models combine parametric neural weights with non-parametric dense vector indexes.",
                "question": "What components does RAG combine?",
                "answers": {"text": ["parametric neural weights with non-parametric dense vector indexes"]}
            },
            {
                "context": "Scaled dot-product attention scales query-key products by 1/sqrt(d_k) to avoid vanishing gradients in softmax.",
                "question": "Why is attention scaled by 1/sqrt(d_k)?",
                "answers": {"text": ["to avoid vanishing gradients in softmax"]}
            }
        ]
        out_file = os.path.join(output_dir, f"{dataset_type}_sample.json")
        with open(out_file, "w") as f:
            json.dump(sample_data, f, indent=2)
        print(f"[✓] Created sample dataset: {out_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download datasets for Orion local training")
    parser.add_argument("--dataset", choices=["squad", "dialogsum", "news_summary"], default="squad")
    parser.add_argument("--output_dir", default="./training/data")
    args = parser.parse_args()
    
    download_data(args.dataset, args.output_dir)
