FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/uploads
ENV UPLOADS_DIR=/app/uploads
EXPOSE 3080
CMD ["node", "src/index.js"]
