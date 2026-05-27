FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/autocontour-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/autocontour-service/ .

ENV PORT=4010
EXPOSE 4010
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4010"]
