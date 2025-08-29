FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# For development purposes
ENV PORT=3001 NODE_ENV=development   
EXPOSE 3001
CMD ["node", "dist/server.js"]
