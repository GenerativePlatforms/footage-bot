FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_CONVEX_URL
ARG VITE_AUTH_PASSWORD

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_AUTH_PASSWORD=$VITE_AUTH_PASSWORD

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "dist", "-s", "-l", "3000"]
