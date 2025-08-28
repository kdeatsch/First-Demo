Stock Prediction Game
=====================

A static web app that lets you guess whether a stock’s price will go up or down using real market data from Alpha Vantage.

Features
--------
- Uses Alpha Vantage TIME_SERIES_DAILY_ADJUSTED with your API key
- Validates tickers and surfaces API errors (including rate limit "Note")
- Randomly selects a non-weekend start date 7–100 days before today
- Displays a chart of the 7 days before the selected start date
- Game loop: predict up/down for each next day, reveals truth, updates score

Local Development
-----------------
Simply open `index.html` in a browser. Because it’s a static app, no build step is required.

GitHub Pages Deployment
-----------------------
1. Commit all files to a GitHub repository.
2. In GitHub, go to Settings → Pages.
3. Under "Build and deployment", choose "Deploy from a branch".
4. Select the `main` (or default) branch and the root folder `/`.
5. Save. Wait a minute for deployment, then open the provided Pages URL.

Notes
-----
- This app uses the free Alpha Vantage API which has strict rate limits. If you encounter a "Note" message, wait a bit and try again.
- Prices shown are adjusted closes. Trading holidays are implicitly handled by using available market dates returned by the API.
