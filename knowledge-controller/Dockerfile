FROM node:22-alpine
RUN apk add --no-cache git openssh-client rsync restic rclone tini
WORKDIR /app
COPY package.json index.js ./
COPY src ./src
COPY scripts ./scripts
RUN chmod 0555 /app/scripts/*.sh
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/index.js"]
