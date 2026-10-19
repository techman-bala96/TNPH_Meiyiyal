# Production image for services/agent. Build: docker build -t meiyiyal-agent services/agent
# Run:   docker run --env-file agent.env -p 8787:8787 meiyiyal-agent   (env names: .env.example, "agent" section)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent ./agent
# offline fallback lexicon (used only when SUPABASE_URL/ANON_KEY are unset)
COPY tests/fixtures ./tests/fixtures
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8787/agent/health')" || exit 1
CMD ["uvicorn", "agent.main:app", "--host", "0.0.0.0", "--port", "8787", "--proxy-headers"]
