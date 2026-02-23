FROM node:20.18.1-alpine3.20 AS builder

WORKDIR /workspace

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-workspace.yaml tsconfig.base.json /workspace/
COPY apps/kajovo-hotel-admin/package.json /workspace/apps/kajovo-hotel-admin/package.json
COPY packages/shared/package.json /workspace/packages/shared/package.json
COPY packages/ui/package.json /workspace/packages/ui/package.json

COPY pnpm-lock.yaml /workspace/pnpm-lock.yaml

RUN pnpm install --frozen-lockfile --filter @kajovo/kajovo-hotel-admin... --filter @kajovo/shared --filter @kajovo/ui

COPY apps/kajovo-hotel-admin /workspace/apps/kajovo-hotel-admin
COPY packages/shared /workspace/packages/shared
COPY packages/ui /workspace/packages/ui
COPY apps/kajovo-hotel /workspace/apps/kajovo-hotel
COPY scripts/collect-brand-assets.mjs /workspace/scripts/collect-brand-assets.mjs

RUN node /workspace/scripts/collect-brand-assets.mjs apps/kajovo-hotel-admin
RUN pnpm --filter @kajovo/kajovo-hotel-admin build

FROM nginx:1.27.2-alpine3.20 AS runtime

COPY apps/kajovo-hotel-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/kajovo-hotel-admin/dist /usr/share/nginx/html
COPY --from=builder /workspace/apps/kajovo-hotel-admin/public/brand /usr/share/nginx/html/brand

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
