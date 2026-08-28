FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx/templates/config.js.template /etc/nginx/templates/config.js.template

EXPOSE 80

CMD ["sh", "-c", "envsubst '${VITE_API_URL}' < /etc/nginx/templates/config.js.template > /usr/share/nginx/html/config.js && nginx -g 'daemon off;'"]
