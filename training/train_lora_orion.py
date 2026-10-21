#!/usr/bin/env python3
"""
Orion 4-Bit QLoRA Fine-Tuning Script
Fine-tunes LLaMA 3.2 / Qwen 2.5 / Mistral on Kaggle RAG datasets.
"""
import os
import argparse
import torch

def run_training(base_model: str, train_data: str, output_dir: str, epochs: int, batch_size: int):
    print(f"[*] Initializing Orion QLoRA Training")
    print(f"    - Base Model: {base_model}")
    print(f"    - Dataset: {train_data}")
    print(f"    - Output Directory: {output_dir}")
    print(f"    - Epochs: {epochs} | Batch Size: {batch_size}")
    
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer
        from datasets import load_dataset
        
        # 4-bit Quantization Config
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        
        print("[*] Loading base tokenizer and 4-bit model...")
        tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
        tokenizer.pad_token = tokenizer.eos_token
        
        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True
        )
        model = prepare_model_for_kbit_training(model)
        
        # LoRA Configuration
        peft_config = LoraConfig(
            r=16,
            lora_alpha=32,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM"
        )
        
        model = get_peft_model(model, peft_config)
        model.print_trainable_parameters()
        
        # Load Dataset
        dataset = load_dataset("json", data_files=train_data, split="train")
        
        # Training Args
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=4,
            learning_rate=2e-4,
            lr_scheduler_type="cosine",
            logging_steps=10,
            save_strategy="epoch",
            fp16=True,
            optim="paged_adamw_8bit"
        )
        
        trainer = SFTTrainer(
            model=model,
            train_dataset=dataset,
            dataset_text_field="text",
            max_seq_length=1024,
            tokenizer=tokenizer,
            args=training_args
        )
        
        print("[*] Starting training loop...")
        trainer.train()
        
        print(f"[✓] Training complete. Saving LoRA adapter to {output_dir}")
        model.save_pretrained(output_dir)
        tokenizer.save_pretrained(output_dir)
        
    except ImportError as e:
        print(f"[!] Missing library: {e}")
        print("To run training, please install: pip install torch transformers peft trl bitsandbytes datasets")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", default="unsloth/Llama-3.2-3B-Instruct")
    parser.add_argument("--train_data", default="./training/data/orion_train.jsonl")
    parser.add_argument("--output_dir", default="./models/orion-lora")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=4)
    args = parser.parse_args()
    
    run_training(args.base_model, args.train_data, args.output_dir, args.epochs, args.batch_size)
