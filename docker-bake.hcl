# Builds every production image from the multi-target Dockerfile in one
# BuildKit session (the shared `builder` stage compiles the monorepo once).
#
#   docker buildx bake -f docker-bake.hcl                    # nexus-{web,worker,collaboration,migrate}:latest
#   TAGS=ci docker buildx bake -f docker-bake.hcl --load       # CI smoke images
#   IMAGE_PREFIX=ghcr.io/zexy2/nexus TAGS=main,sha-abc1234 docker buildx bake -f docker-bake.hcl --push
#
# docker-compose.prod.yml builds the same targets for the server-side fallback.

variable "IMAGE_PREFIX" {
  default = "nexus"
}

# Comma-separated tag list applied to every image.
variable "TAGS" {
  default = "latest"
}

# NEXT_PUBLIC_* values are inlined into the web client bundle at build time,
# so registry images must be built with the production values.
variable "NEXT_PUBLIC_APP_URL" {
  default = "http://localhost:3000"
}
variable "NEXT_PUBLIC_COLLABORATION_URL" {
  default = "ws://localhost:1234"
}
variable "NEXT_PUBLIC_DEMO_MODE" {
  default = "true"
}
variable "NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED" {
  default = "false"
}
variable "NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED" {
  default = "false"
}

function "tags" {
  params = [name]
  result = [for t in split(",", TAGS) : "${IMAGE_PREFIX}-${name}:${trimspace(t)}"]
}

group "default" {
  targets = ["web", "worker", "collaboration", "migrate"]
}

target "_common" {
  context    = "."
  dockerfile = "Dockerfile"
  args = {
    NEXT_PUBLIC_APP_URL                   = NEXT_PUBLIC_APP_URL
    NEXT_PUBLIC_COLLABORATION_URL         = NEXT_PUBLIC_COLLABORATION_URL
    NEXT_PUBLIC_DEMO_MODE                 = NEXT_PUBLIC_DEMO_MODE
    NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED     = NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED
    NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED = NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED
  }
  labels = {
    "org.opencontainers.image.source" = "https://github.com/zexy2/Nexus"
  }
}

target "web" {
  inherits = ["_common"]
  target   = "web"
  tags     = tags("web")
}

target "worker" {
  inherits = ["_common"]
  target   = "worker"
  tags     = tags("worker")
}

target "collaboration" {
  inherits = ["_common"]
  target   = "collaboration"
  tags     = tags("collaboration")
}

target "migrate" {
  inherits = ["_common"]
  target   = "migrate"
  tags     = tags("migrate")
}
