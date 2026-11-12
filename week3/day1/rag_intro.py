import os
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
my_api_key = os.getenv("GROQ_API_KEY")

if not my_api_key:
    raise ValueError("Api key is null")

client = Groq(api_key = my_api_key)
model = "openai/gpt-oss-120b"


# step 1 --> knowledge base
knowledge_base = {
    "name" : "Abhinav Pandey",
    "age" : "The age of abhinav is 21 years",
    "net_worth" : "The net worth of abhinav is 1000"
}

#Step 2 --> retreival
def retreive_info(question):
    question = question.lower()
    if "age" in question:
        return knowledge_base["age"]
    elif "net_worth" in question:
        return knowledge_base["net_worth"]
    else:
        return None

def ask_llm(question):

    context = retreive_info(question)

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
    response = client.chat.completions.create(model = model, messages = messages)
    answer = response.choices[0].message.content
    return answer

question = "What is abhinav old?"
print (ask_llm(question))