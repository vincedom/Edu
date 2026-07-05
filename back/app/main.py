from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter

from app.core.config import settings
from app.api.stream import router as stream_router
from app.api.auth_routes import router as auth_router

# GraphQL basique de secours
import strawberry
@strawberry.type
class Query:
    @strawberry.field
    def hello(self) -> str:
        return "GraphQL fonctionnel"

schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema)

# Init FastAPI
app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Enregistrement des routes
app.include_router(graphql_app, prefix="/graphql")
app.include_router(stream_router, prefix="/api") # Ce qui donne l'URL finale : /api/stream
app.include_router(auth_router, prefix="/api")