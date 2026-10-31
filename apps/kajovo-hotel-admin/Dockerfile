FROM nginx:1.27.2-alpine3.20 AS runtime

COPY apps/kajovo-hotel-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/cml-web-retirement/service-worker.js /usr/share/nginx/html/cml-retire-worker.js

# New section assets are served by the signed API; no old browser bundle enters this image.
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html && chmod -R a+rX /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
