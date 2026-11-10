import json
import os
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pypdf import PdfReader

load_dotenv()

client = Groq(
    api_key = os.getenv("GROQ_API_KEY")
)

model = "openai/gpt-oss-120b"

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
RESUME_PATH = Path(__file__).parent / "AbhinavPandey_Resume_19_sep_2026.pdf"


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://abhinav-ai-portfolio-three.vercel.app"
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# parser resume
#parse resume
class Experience(BaseModel):
    company: str | None = None
    role: str | None = None
    duration: str | None = None
    description: str | None = None
    skills_used: list[str] = []

class Resume(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None

    total_experience_years: float | None = None

    skills: list[str] = []
    experiences: list[Experience] = []
    education: list[str] = []
    projects: list[str] = []
    certifications: list[str] = []
resume_schema = Resume.model_json_schema()

class ChatRequest(BaseModel):
    question: str

def ask_candidate(question: str, resume: Resume):

    system_prompt = f"""
You are an AI assistant representing a job candidate.

Below is everything you know about the candidate.

{resume.model_dump_json(indent=2)}

Rules:

1. Answer only using this information.

2. Never hallucinate.

3. If information is unavailable,
say

"I don't have enough information to answer that."

4. Give the professional answer and don't add some extra point yourself .

5. Answer as if HR is interviewing this candidate.
"""

    response = client.chat.completions.create(

        model=model,

        messages=[

            {
                "role":"system",
                "content":system_prompt
            },

            {
                "role":"user",
                "content":question
            }

        ]

    )

    return response.choices[0].message.content

def parse_resume(resume_text):
    system_prompt = f"""
    You are an expert resume parser.

    Extract information from the resume based on its meaning,
    not only based on exact section headings.

    Different resumes may use different headings.

    For example:
    - Experience
    - Professional Experience
    - Work History
    - Employment
    - Internships

    These may all contain relevant experience.

    Skills may also appear in the skills section, work experience,
    internships or projects.

    Return ONLY valid JSON matching this schema:

    {resume_schema}

    Important rules:

    1. Do not invent information.
    2. If a value is not available, return null.
    3. If a list has no information, return an empty list.
    4. Include internships inside experiences.
    5. Extract skills mentioned across the entire resume.
    """
    user_prompt = f"""
    Parse the following resume:

    {resume_text}
    """
    message_system={
        "role" : "system",
        "content" : system_prompt
    }
    message_user={
        "role" : "user",
        "content" : user_prompt
    }
    messages=[message_system, message_user]
    response_format={
        "type": "json_object"
    }
    response=client.chat.completions.create(model=model, messages=messages, response_format=response_format)
    raw_output = response.choices[0].message.content
    data = json.loads(raw_output)
    resume = Resume(**data)
    return resume


# pdf extraction
def read_pdf(file_path: Path):
    if not file_path.exists():
        raise FileNotFoundError(
            f"Resume PDF not found: {file_path}"
        )

    reader = PdfReader(str(file_path))
    text = ""

    for page in reader.pages:
        page_text = page.extract_text()

        if page_text:
            text += page_text + "\n"

    return text

@app.get("/")
def home():
    resume_text = read_pdf(RESUME_PATH)
    resume = parse_resume(resume_text)
    print(resume_text)
    print(resume)
    return {
        "message" : "resume_parsed"
    }

@app.post("/chat")
def chat(request: ChatRequest):

    try:
        resume_text = read_pdf(RESUME_PATH)

        resume = parse_resume(resume_text)

        answer = ask_candidate(
            request.question,
            resume
        )

        return {
            "answer": answer
        }

    except Exception as e:
        print("CHAT ERROR:", repr(e))

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@app.get("/resume/download")
def download_resume():

    if not RESUME_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Resume PDF not found"
        )

    return FileResponse(
        path=str(RESUME_PATH),
        filename="Abhinav_Pandey_Resume.pdf",
        media_type="application/pdf"
    )

@app.get("/health")
def health():
    return {
        "status": "ok",
        "message": "Abhinav AI backend is running"
    }