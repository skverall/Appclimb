FROM golang:1.26.5-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/appclimb-api ./cmd/appclimb-api \
  && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/appclimb-worker ./cmd/appclimb-worker

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/appclimb-api /appclimb-api
COPY --from=build /out/appclimb-worker /appclimb-worker
EXPOSE 8080
CMD ["/appclimb-api"]
