FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

RUN mkdir -p /app/uploads

# Set after npm ci so dev tooling (tsx for migrations) is still installed.
# Production mode also refuses to boot with the repo's placeholder secrets.
ENV NODE_ENV=production

EXPOSE 5005

CMD ["npm", "start"]
