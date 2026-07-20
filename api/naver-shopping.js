// naver_api.py의 search_shopping()을 그대로 옮긴 버전
function cleanText(text) {
    if (!text) return "";
    const noTags = text.replace(/<[^>]+>/g, "");
    // HTML 엔티티 디코딩 (&amp; 등)
    return noTags
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export default async function handler(req, res) {
    const {
        query,
        display = 10,
        start = 1,
        sort = "sim",
        filter,
        exclude,
    } = req.query;

    if (!query) {
        return res.status(400).json({ error: "query 파라미터가 필요합니다." });
    }

    const params = new URLSearchParams({ query, display, start, sort });
    if (filter) params.append("filter", filter);
    if (exclude) params.append("exclude", exclude);

    try {
        const response = await fetch(
            `https://openapi.naver.com/v1/search/shop.json?${params}`,
            {
                headers: {
                    "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID,
                    "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET,
                },
            }
        );

        if (response.status === 429) {
            return res.status(429).json({ error: "네이버 API 일일 호출 한도를 초과했습니다." });
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: body.errorMessage || body.message || "네이버 API 오류",
            });
        }

        const data = await response.json();

        // collect_mall_products.py의 clean_text 적용
        const items = (data.items || []).map((item) => ({
            ...item,
            title: cleanText(item.title),
        }));

        res.status(200).json({ ...data, items });
    } catch (err) {
        res.status(500).json({ error: "네이버 API 호출 실패", detail: err.message });
    }
}