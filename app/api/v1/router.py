"""
CareOps — API v1 Router
Aggregates all endpoint routers into a single v1 router.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.automation import router as automation_router
from app.api.v1.endpoints.bookings import router as bookings_router
from app.api.v1.endpoints.communications import router as comms_router
from app.api.v1.endpoints.dashboard import router as dashboard_router
from app.api.v1.endpoints.forms import router as forms_router
from app.api.v1.endpoints.google_auth import router as google_auth_router
from app.api.v1.endpoints.inventory import router as inventory_router
from app.api.v1.endpoints.onboarding import router as onboarding_router
from app.api.v1.endpoints.staff import router as staff_router
from app.api.v1.endpoints.services import router as services_router

api_v1_router = APIRouter()

api_v1_router.include_router(onboarding_router)
api_v1_router.include_router(comms_router)
api_v1_router.include_router(bookings_router)
api_v1_router.include_router(services_router)
api_v1_router.include_router(forms_router)
api_v1_router.include_router(inventory_router)
api_v1_router.include_router(dashboard_router)
api_v1_router.include_router(automation_router)
api_v1_router.include_router(staff_router)
api_v1_router.include_router(google_auth_router)

