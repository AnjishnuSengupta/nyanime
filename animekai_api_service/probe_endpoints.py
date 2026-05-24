import asyncio
from curl_cffi.requests import AsyncSession


async def probe():
    slug = "naruto-9r5k"
    base_url = "https://anikai.to"
    endpoints = [
        f"/ajax/anime/info?slug={slug}",
        f"/ajax/anime/details?slug={slug}",
        f"/ajax/anime/get-info?slug={slug}",
        f"/ajax/anime/metadata?slug={slug}",
        f"/api/anime/info?slug={slug}",
        f"/api/v1/anime/info?slug={slug}",
        f"/ajax/links/view?id={slug}",
    ]

    async with AsyncSession(impersonate="chrome110") as session:
        for endpoint in endpoints:
            url = base_url + endpoint
            print(f"Testing URL: {url}")
            try:
                response = await session.get(url)
                print(f"Status Code: {response.status_code}")
                if response.status_code == 200:
                    print(f"Response body (first 500 chars): {response.text[:500]}")
                print("-" * 40)
            except Exception as e:
                print(f"Error: {e}")
                print("-" * 40)


if __name__ == "__main__":
    asyncio.run(probe())
