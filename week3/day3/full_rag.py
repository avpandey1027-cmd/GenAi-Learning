import os
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq
from sentence_transformers import SentenceTransformer
import numpy as np
import sys

load_dotenv()
my_api_key = os.getenv("GROQ_API_KEY")

if not my_api_key:
    raise ValueError("Api key is null")

client = Groq(api_key = my_api_key)
llm_model = "openai/gpt-oss-120b"
emb_model = SentenceTransformer("all-MiniLm-L6-v2")

# step 1 --> knowledge base
documents = [
    "Employees can receive 24 days of paid leave per year.",
   
    "Employees work from the office on Tuesday, Wednesday and Thursday. "
    "Monday and Friday are optional work-from-home days.",
   
    "Employees receive Rs 3000 per month for gym reimbursement.",
   
    "Employees can claim Rs 2000 per month for home internet.",
   
    "Employees have a 90 day notice period."
]

document_embeddings = emb_model.encode(documents)
print(sys.getsizeof(document_embeddings))

def cosine_similarity(a,b):
    return np.dot(a,b) / (
        np.linalg.norm(a) * np.linalg.norm(b)
    )

def reterive(qembedding):
    scores = []
    for i,document in enumerate(document_embeddings):
        score = cosine_similarity(qembedding,document)
        scores.append((score,documents[i]))
    scores.sort(reverse=True)
    return scores[0] # line 0.9

def ask_llm(question,context):

    system_prompt = f"""answer in one line. Answer based on this context. do not hallucinate. Context: {context}"""
    system_message = {
        "role" : "system",
        "content" : system_prompt
    }
    message = {
        "role" : "user",
        "content" : question
    }

    messages = [system_message,message]
    response = client.chat.completions.create(model = llm_model, messages = messages)
    answer = response.choices[0].message.content
    return answer

query = "How much vacation do I get?"
qembedding = emb_model.encode(query)
score,context = reterive(qembedding)
answer = ask_llm(query,context)
print(answer)