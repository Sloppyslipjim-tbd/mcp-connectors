FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

ENV PORT=3006
EXPOSE 3006

CMD ["npm", "start"]
