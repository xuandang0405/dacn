FROM python:3.12-slim
WORKDIR /code
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000

