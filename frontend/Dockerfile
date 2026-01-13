FROM node:18-alpine

WORKDIR /app

# Install dependencies only
COPY package.json package-lock.json ./
RUN npm install

# Source code comes from volume mount
EXPOSE 3000

CMD ["npm", "start"]
