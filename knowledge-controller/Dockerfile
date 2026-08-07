FROM node:22-alpine
ARG BLACKGOLD_KNOWLEDGE_UID=994
RUN apk add --no-cache git openssh-client rsync restic rclone tini
RUN adduser -D -H -u "${BLACKGOLD_KNOWLEDGE_UID}" blackgold
WORKDIR /app
COPY package.json index.js ./
COPY src ./src
COPY scripts ./scripts
RUN chmod 0555 /app/scripts/*.sh
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/index.js"]
