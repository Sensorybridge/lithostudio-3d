FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY manifest.json /usr/share/nginx/html/manifest.json
COPY icon.svg /usr/share/nginx/html/icon.svg
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
