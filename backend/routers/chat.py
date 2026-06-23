from fastapi import APIRouter, Depends, HTTPException, status

from auth_dependencies import AuthContext, get_auth_context
from schemas.chat import ChatRequest, ChatResponse
from services.ai_chat import (
    ChatConfigurationError,
    ChatUpstreamError,
    generate_chat_reply,
)

router = APIRouter(tags=["chat"])


@router.post("/api/chat", response_model=ChatResponse)
def post_chat(
    request: ChatRequest,
    auth: AuthContext = Depends(get_auth_context),
) -> ChatResponse:
    try:
        result = generate_chat_reply(
            auth.tenant,
            auth.user_level,
            request.message,
            request.current_page,
        )
    except ChatConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI chat is not configured on the server.",
        ) from exc
    except ChatUpstreamError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI assistant is temporarily unavailable.",
        ) from exc

    return ChatResponse(**result)
