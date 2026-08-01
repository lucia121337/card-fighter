"""네이버 오픈 API(검색, 데이터랩) 호출 클라이언트.

문서 참고: naver-api-app/docs/00-openapi-guide.md 외
"""
from __future__ import annotations

import requests

BASE_URL = "https://openapi.naver.com"

# 데이터랩 쇼핑인사이트 분야(카테고리) 코드
SHOPPING_CATEGORIES = {
    "패션의류": "50000000",
    "패션잡화": "50000001",
    "화장품/미용": "50000002",
    "디지털/가전": "50000003",
    "가구/인테리어": "50000004",
    "출산/육아": "50000005",
    "식품": "50000006",
    "스포츠/레저": "50000007",
    "생활/건강": "50000008",
    "여가/생활편의": "50000009",
    "면세점": "50000010",
    "도서": "50005542",
}


class NaverAPIError(Exception):
    """네이버 API 호출 실패 시 발생하는 예외."""


def _headers(client_id: str, client_secret: str, json_body: bool = False) -> dict:
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
    }
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _handle_response(resp: requests.Response) -> dict:
    if resp.status_code == 200:
        return resp.json()
    try:
        body = resp.json()
        message = body.get("errorMessage") or body.get("message") or resp.text
    except ValueError:
        message = resp.text
    raise NaverAPIError(f"[{resp.status_code}] {message}")


def _search_get(path: str, client_id: str, client_secret: str, params: dict) -> dict:
    url = f"{BASE_URL}/v1/search/{path}"
    resp = requests.get(url, headers=_headers(client_id, client_secret), params=params, timeout=10)
    return _handle_response(resp)


def search_blog(client_id: str, client_secret: str, query: str, display: int = 10, start: int = 1, sort: str = "sim") -> dict:
    return _search_get("blog.json", client_id, client_secret, {
        "query": query, "display": display, "start": start, "sort": sort,
    })


def search_news(client_id: str, client_secret: str, query: str, display: int = 10, start: int = 1, sort: str = "sim") -> dict:
    return _search_get("news.json", client_id, client_secret, {
        "query": query, "display": display, "start": start, "sort": sort,
    })


def search_cafearticle(client_id: str, client_secret: str, query: str, display: int = 10, start: int = 1, sort: str = "sim") -> dict:
    return _search_get("cafearticle.json", client_id, client_secret, {
        "query": query, "display": display, "start": start, "sort": sort,
    })


def search_shopping(
    client_id: str,
    client_secret: str,
    query: str,
    display: int = 10,
    start: int = 1,
    sort: str = "sim",
    filter: str | None = None,
    exclude: str | None = None,
) -> dict:
    params = {"query": query, "display": display, "start": start, "sort": sort}
    if filter:
        params["filter"] = filter
    if exclude:
        params["exclude"] = exclude
    return _search_get("shop.json", client_id, client_secret, params)


def datalab_search_trend(
    client_id: str,
    client_secret: str,
    start_date: str,
    end_date: str,
    time_unit: str,
    keyword_groups: list[dict],
    device: str | None = None,
    gender: str | None = None,
    ages: list[str] | None = None,
) -> dict:
    body = {
        "startDate": start_date,
        "endDate": end_date,
        "timeUnit": time_unit,
        "keywordGroups": keyword_groups,
    }
    if device:
        body["device"] = device
    if gender:
        body["gender"] = gender
    if ages:
        body["ages"] = ages

    url = f"{BASE_URL}/v1/datalab/search"
    resp = requests.post(url, headers=_headers(client_id, client_secret, json_body=True), json=body, timeout=10)
    return _handle_response(resp)


def datalab_shopping_category_trend(
    client_id: str,
    client_secret: str,
    start_date: str,
    end_date: str,
    time_unit: str,
    categories: list[dict],
    device: str | None = None,
    gender: str | None = None,
    ages: list[str] | None = None,
) -> dict:
    """쇼핑인사이트 분야별 트렌드.

    categories: [{"name": "패션의류", "param": ["50000000"]}, ...] 형태.
    SHOPPING_CATEGORIES 를 참고해 이름->cid 로 param 을 구성합니다.
    """
    body = {
        "startDate": start_date,
        "endDate": end_date,
        "timeUnit": time_unit,
        "category": categories,
    }
    if device:
        body["device"] = device
    if gender:
        body["gender"] = gender
    if ages:
        body["ages"] = ages

    url = f"{BASE_URL}/v1/datalab/shopping/categories"
    resp = requests.post(url, headers=_headers(client_id, client_secret, json_body=True), json=body, timeout=10)
    return _handle_response(resp)
