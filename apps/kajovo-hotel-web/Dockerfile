FROM node:20.18.1-alpine3.20 AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json /workspace/
COPY apps/kajovo-hotel-web/package.json /workspace/apps/kajovo-hotel-web/package.json
COPY packages/shared/package.json /workspace/packages/shared/package.json
COPY packages/ui/package.json /workspace/packages/ui/package.json

COPY pnpm-lock.yaml /workspace/pnpm-lock.yaml

RUN pnpm install --frozen-lockfile --filter @kajovo/kajovo-hotel-web... --filter @kajovo/shared --filter @kajovo/ui

COPY apps/kajovo-hotel-web /workspace/apps/kajovo-hotel-web
COPY packages/shared /workspace/packages/shared
COPY packages/ui /workspace/packages/ui
COPY apps/kajovo-hotel /workspace/apps/kajovo-hotel

RUN pnpm --filter @kajovo/kajovo-hotel-web build

FROM nginx:1.27.2-alpine3.20 AS runtime

COPY apps/kajovo-hotel-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/kajovo-hotel-web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
