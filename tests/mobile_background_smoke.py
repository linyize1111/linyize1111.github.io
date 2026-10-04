"""Manual visual/network smoke: python tests/mobile_background_smoke.py.

Requires Playwright's Chromium browser. Uses local files so it does not depend
on GitHub Pages response speed during development.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    url = (Path(__file__).resolve().parents[1] / "index.html").as_uri()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 390, "height": 844})
            video_requests = []
            page.on("request", lambda request: video_requests.append(request.url)
                    if "bg-video.mp4" in request.url else None)
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(600)
            mobile = page.evaluate("""() => ({
                videoDisplay: getComputedStyle(document.querySelector('#bg-video')).display,
                mainBackground: getComputedStyle(document.querySelector('#main')).backgroundColor,
                source: document.querySelector('#bg-video source').getAttribute('src'),
                scrollWidth: document.documentElement.scrollWidth
            })""")
            assert mobile["videoDisplay"] == "none", mobile
            assert mobile["source"] is None, mobile
            assert not video_requests, "mobile downloaded the decorative video"
            assert mobile["mainBackground"] == "rgb(255, 255, 255)", mobile
            assert mobile["scrollWidth"] == 390, mobile

            page.set_viewport_size({"width": 1440, "height": 900})
            page.wait_for_timeout(600)
            assert page.locator("#bg-video source").get_attribute("src") == "images/bg-video.mp4"
            assert video_requests, "desktop video did not load"
            print("PASS mobile poster/reading panel; desktop video retained")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
