#!/usr/bin/env python3
"""Generate StoX Technical Specification PDF Document"""

from fpdf import FPDF
import datetime

class StoXSpecPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, 'StoX Indian Equities Analysis PWA - Technical Specification', 0, 0, 'L')
        self.cell(0, 8, f'Version 2.10.24', 0, 1, 'R')
        self.set_draw_color(200, 200, 200)
        self.line(10, 15, 200, 15)
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', 0, 0, 'C')

    def chapter_title(self, title, level=1):
        if level == 1:
            self.set_font('Helvetica', 'B', 16)
            self.set_text_color(30, 60, 120)
            self.ln(5)
            self.cell(0, 12, title, 0, 1)
            self.set_draw_color(30, 60, 120)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)
        elif level == 2:
            self.set_font('Helvetica', 'B', 13)
            self.set_text_color(50, 90, 150)
            self.ln(4)
            self.cell(0, 10, title, 0, 1)
            self.ln(2)
        elif level == 3:
            self.set_font('Helvetica', 'B', 11)
            self.set_text_color(70, 70, 70)
            self.ln(3)
            self.cell(0, 8, title, 0, 1)
            self.ln(1)

    def body_text(self, text):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, text)
        self.ln(2)

    def bullet_point(self, text, indent=10):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        self.set_x(self.l_margin + indent)
        self.multi_cell(0, 6, '- ' + text)

    def table_header(self, headers, widths):
        self.set_font('Helvetica', 'B', 9)
        self.set_fill_color(30, 60, 120)
        self.set_text_color(255, 255, 255)
        for i, (header, width) in enumerate(zip(headers, widths)):
            self.cell(width, 7, header, 1, 0, 'C', True)
        self.ln()

    def table_row(self, cells, widths, fill=False):
        self.set_font('Helvetica', '', 8)
        self.set_text_color(40, 40, 40)
        if fill:
            self.set_fill_color(245, 245, 250)
        for i, (cell, width) in enumerate(zip(cells, widths)):
            self.cell(width, 6, str(cell), 1, 0, 'C', fill)
        self.ln()

    def formula_block(self, formula):
        self.set_font('Courier', '', 9)
        self.set_fill_color(240, 240, 245)
        self.set_text_color(60, 60, 60)
        self.cell(0, 7, formula, 1, 1, 'L', True)
        self.ln(1)


def generate_spec():
    pdf = StoXSpecPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Title Page
    pdf.add_page()
    pdf.ln(40)
    pdf.set_font('Helvetica', 'B', 28)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 15, 'StoX', 0, 1, 'C')
    pdf.set_font('Helvetica', '', 18)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 10, 'Indian Equities Analysis PWA', 0, 1, 'C')
    pdf.ln(10)
    pdf.set_font('Helvetica', 'B', 20)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 12, 'Technical Specification', 0, 1, 'C')
    pdf.ln(10)
    pdf.set_font('Helvetica', '', 14)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, 'Version 2.10.24', 0, 1, 'C')
    pdf.cell(0, 8, f'Generated: {datetime.date.today().strftime("%B %d, %Y")}', 0, 1, 'C')
    pdf.ln(20)
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(60, 60, 60)
    pdf.multi_cell(0, 7, 'Comprehensive documentation of all technical indicators, entry score system, exit score system, scoring calculations, multi-timeframe analysis, classification thresholds, and modifier logic used in the StoX analysis platform.', align='C')

    # Table of Contents
    pdf.add_page()
    pdf.chapter_title('Table of Contents')
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(40, 40, 40)
    toc = [
        ('1. Overview', 3),
        ('   1.1 System Architecture', 3),
        ('   1.2 Scoring Philosophy', 3),
        ('2. Technical Indicators', 4),
        ('   2.1 Trend & Moving Averages', 4),
        ('   2.2 Trend Direction & Strength', 5),
        ('   2.3 Momentum Oscillators', 6),
        ('   2.4 Volume-Based Indicators', 7),
        ('   2.5 Structure & Volatility', 8),
        ('3. Entry Score System', 9),
        ('   3.1 Three-Pillar Model Overview', 9),
        ('   3.2 Pillar 1: Trend Health (30 pts)', 10),
        ('   3.3 Pillar 2: Pullback Quality (30 pts)', 11),
        ('   3.4 Pillar 3: 4% Probability (40 pts)', 12),
        ('   3.5 Modifiers', 13),
        ('   3.6 Classification System', 14),
        ('4. Multi-Timeframe Scoring', 15),
        ('   4.1 Timeframe Weights', 15),
        ('   4.2 Aggregation Logic', 15),
        ('   4.3 MTF Alignment Bonus', 16),
        ('5. Exit Score System', 17),
        ('   5.1 Four-Pillar Exit Model', 17),
        ('   5.2 Exit Modifiers', 18),
        ('   5.3 Exit Classification', 19),
        ('6. Confidence Models', 20),
        ('   6.1 Session Confidence', 20),
        ('   6.2 Horizon Confidence', 20),
        ('   6.3 Forward Confidence', 21),
        ('7. Configuration', 22),
        ('   7.1 SCORE_CONFIG Parameters', 22),
        ('   7.2 Configurable Thresholds', 23),
        ('Appendix A: Indicator Formulas', 24),
    ]
    for item, page in toc:
        pdf.cell(0, 7, item, 0, 1)

    # Chapter 1: Overview
    pdf.add_page()
    pdf.chapter_title('1. Overview')
    pdf.chapter_title('1.1 System Architecture', level=2)
    pdf.body_text('StoX is a Progressive Web App (PWA) for Indian equities analysis, built with vanilla React 18 and loaded via Babel standalone transpilation (no build step). All JavaScript files are loaded via script tags in index.html.')
    pdf.body_text('The system analyzes 200 NIFTY stocks across multiple timeframes (Daily, Hourly, Weekly) using 50+ technical indicators organized into a hierarchical scoring system.')

    pdf.chapter_title('1.2 Scoring Philosophy', level=2)
    pdf.body_text('The scoring system uses a four-pillar model for entry signals and a four-pillar model for exit signals. Each pillar aggregates related indicators into a composite score, providing a structured approach to technical analysis.')
    pdf.body_text('Key principles:')
    pdf.bullet_point('Multi-timeframe confirmation: Higher timeframes (Weekly) provide context, while lower timeframes (Hourly) provide timing')
    pdf.bullet_point('Volatility normalization: ATR percentile ranks adapt thresholds to current market conditions')
    pdf.bullet_point('Pillar ceilings: Each pillar has a maximum score, preventing any single indicator from dominating')
    pdf.bullet_point('Modifiers: Bonuses and penalties adjust scores based on market structure and risk factors')

    # Chapter 2: Technical Indicators
    pdf.add_page()
    pdf.chapter_title('2. Technical Indicators')
    pdf.chapter_title('2.1 Trend & Moving Averages', level=2)

    indicators_trend = [
        ('SMA', 'Simple Moving Average', 'period=20', 'Sum of closes / period'),
        ('EMA', 'Exponential Moving Average', 'period=20', 'alpha=2/(period+1), EWM'),
        ('WMA', 'Weighted Moving Average', 'period=20', 'Weighted sum / period*(period+1)/2'),
        ('HMA', 'Hull Moving Average', 'period=20', 'WMA(2*WMA(n/2) - WMA(n), sqrt(n))'),
        ('KAMA', 'Kaufman Adaptive MA', 'period=10', 'Adapts smoothing based on efficiency ratio'),
        ('Rolling VWAP(10)', 'Volume-Weighted Avg Price', 'period=10', 'TP*Volume / Volume cumulative'),
        ('Mansfield RS', 'Relative Strength vs index', 'n=52', '(stock/index*100)/SMA-1)*100'),
        ('Beta', 'Sensitivity to index', 'n=60', 'Rolling OLS regression slope'),
    ]

    headers = ['Indicator', 'Description', 'Parameters', 'Formula']
    widths = [30, 45, 35, 70]
    pdf.table_header(headers, widths)
    for i, row in enumerate(indicators_trend):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('2.2 Trend Direction & Strength', level=2)

    indicators_trend_dir = [
        ('ATR', 'Average True Range', 'period=14', 'EWM of True Range'),
        ('ADX', 'Trend strength (0-100)', 'period=14', 'Returns adx, plusDI, minusDI'),
        ('SuperTrend', 'Trend direction + stop', 'period=10, mult=3', 'ATR-based bands'),
        ('PSAR', 'Parabolic SAR', 'af=0.02, step=0.02', 'SAR accelerates toward price'),
        ('Vortex', 'Trend direction', 'period=14', 'Returns plus, minus'),
        ('Aroon', 'Time since extreme', 'period=25', 'Returns up, down, osc'),
        ('Ichimoku', 'Multi-component cloud', 'various', 'Tenkan(9), Kijun(26), etc.'),
        ('MACD', 'Trend momentum', '12,26,9', 'macd, signal, histogram'),
        ('TSI', 'True Strength Index', '25,13', 'Double-smoothed momentum'),
        ('STC', 'Schaff Trend Cycle', '23,50,10', 'Stochastic of MACD'),
        ('AO', 'Awesome Oscillator', '-', 'SMA(5) - SMA(34) of midpoints'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(indicators_trend_dir):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('2.3 Momentum Oscillators', level=2)

    indicators_momentum = [
        ('RSI', 'Overbought/oversold', 'period=14', '100-100/(1+avgGain/avgLoss)'),
        ('StochRSI', 'RSI of RSI', '14,3,3', 'Returns k, d'),
        ('Williams %R', 'Distance from high', 'period=14', '(HH-close)/(HH-LL)*-100'),
        ('CCI', 'Price vs mean deviation', 'period=20', '(TP-mean)/(0.015*MAD)'),
        ('ROC', 'Rate of change', 'period=12', '(close-close_n)/close_n*100'),
        ('Momentum', 'Absolute change', 'period=10', 'close-close_n'),
        ('MFI', 'Money Flow Index', 'period=14', 'RSI-like, volume-weighted'),
        ('CMF', 'Chaikin Money Flow', 'period=20', 'Cumulative CLV*volume/volume'),
        ('FI', 'Force Index', 'period=13', 'EWM of (change*volume)'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(indicators_momentum):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('2.4 Volume-Based Indicators', level=2)

    indicators_volume = [
        ('OBV', 'On-Balance Volume', '-', 'Cumulative volume by direction'),
        ('PVT', 'Price Volume Trend', '-', 'OBV weighted by % price change'),
        ('KVO', 'Klinger Volume Osc', '34,55,13', 'Volume flow by trend direction'),
        ('Anchored VWAP', 'VWAP from anchor', 'anchor=252 bars', 'TP*Vol/Vol cumulative'),
        ('VP', 'Volume Profile', '24 bins, 60 bars', 'Returns POC, VAH, VAL'),
        ('TTM Squeeze', 'Volatility squeeze', 'BB20,2, KC1.5', 'True when BB inside KC'),
        ('Accum/Dist', 'Accum vs distribution', '-', 'CLV-based ADL'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(indicators_volume):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('2.5 Structure & Volatility', level=2)

    indicators_structure = [
        ('BB', 'Bollinger Bands', '20,2', 'SMA +/- 2*StdDev'),
        ('KC', 'Keltner Channels', '20,1.5', 'EMA +/- 1.5*ATR'),
        ('DC', 'Donchian Channels', '20', 'Rolling highest high / lowest low'),
        ('Chandelier', 'Trailing stop', '22,3', 'Highest high - 3*ATR'),
        ('Darvas Box', 'Breakout box', '20,3', 'Confirmed swing high'),
        ('Fibonacci', 'Retracement levels', '50 bars', '0.236,0.382,0.5,0.618,0.786'),
        ('Pivot', 'Support/resistance', 'prev H/L/C', 'Classic + Camarilla levels'),
        ('ZigZag', 'Trend pivots', '5%', 'Filters noise < threshold'),
        ('Fractals', 'Swing points', '5-bar', 'Up fractal = bar high max of 5'),
        ('Choppiness', 'Trend vs range', '14', '<38.2 trending, >61.8 ranging'),
        ('MTF Align', 'Multi-TF trend', '-', 'EMA9/21/50/SMA100/200 score'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(indicators_structure):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    # Chapter 3: Entry Score System
    pdf.add_page()
    pdf.chapter_title('3. Entry Score System')
    pdf.chapter_title('3.1 Three-Pillar Model Overview', level=2)
    pdf.body_text('The entry score system uses a four-pillar model that aggregates 50+ indicators into four composite scores:')
    pdf.ln(2)

    pdf.formula_block('Raw Total = Trend Health (0-30) + Pullback Quality (0-30) + 4% Probability (0-40)')
    pdf.formula_block('Final Score = clamp(0, 100, Raw Total + Modifiers)')
    pdf.ln(2)

    pdf.body_text('Each pillar measures a different aspect of the entry setup:')
    pdf.bullet_point('Trend Health: Is the stock in a confirmed uptrend? (30 points max)')
    pdf.bullet_point('Pullback Quality: Is the stock at a favorable entry point? (30 points max)')
    pdf.bullet_point('4% Probability: How likely is a 4% move from current price? (40 points max)')
    pdf.ln(2)

    pdf.chapter_title('3.2 Pillar 1: Trend Health (30 pts)', level=2)
    pdf.body_text('Trend Health measures the strength and quality of the uptrend. Higher scores indicate stronger trends with multiple confirmations.')
    pdf.ln(2)

    trend_components = [
        ('Price > SMA(50)', '5', 'close > sma50', 'Stock above 50-day average'),
        ('SMA(20) > SMA(50)', '5', 'sma20 > sma50', 'Golden cross structure'),
        ('Price > SMA(20) or Rolling VWAP', '5', 'close > sma20 OR close > vwap', 'Short-term support held'),
        ('ADX + DI', '5', 'adx >= 25 AND +DI > -DI', 'Strong directional trend'),
        ('Mansfield RS', '5', 'rsMansfield > 0', 'Outperforming Nifty50'),
        ('MACD Cross', '5', 'macd > signal', 'Bullish momentum'),
        ('Weekly HA Bullish', '2.5', 'weeklyHABullish === true', 'Higher TF confirms uptrend'),
        ('SMA(20) Slope', '2.5', 'sma20Slope5 > 0 AND close > sma20', 'Rising 20-day average'),
    ]

    headers = ['Component', 'Points', 'Condition', 'Meaning']
    widths = [40, 15, 65, 60]
    pdf.table_header(headers, widths)
    for i, row in enumerate(trend_components):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('3.3 Pillar 2: Pullback Quality (30 pts)', level=2)
    pdf.body_text('Pullback Quality measures whether the stock is at a favorable entry point. Higher scores indicate better risk/reward setups with consolidation near support.')
    pdf.ln(2)

    pullback_components = [
        ('Distance (inner)', '10', '+/- 1.0 ATR', 'Price near support (tight)'),
        ('Distance (outer)', '5', '+/- 1.5 ATR', 'Price near support (wider)'),
        ('Candle Color', '5', 'close > open', 'Bullish candle'),
        ('BB Width Squeeze', '5', 'bbWidth < bbWidthPrev5', 'Volatility contracting'),
        ('RSI Oversold', '5', 'StochRSI<20 OR RSI<40/35', 'Oversold condition'),
        ('Volume Confirm', '5', 'volRatio > 1.5 AND close > open', 'Above-avg volume on up day'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(pullback_components):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('3.4 Pillar 3: 4% Probability (40 pts)', level=2)
    pdf.body_text('4% Probability measures how likely the stock is to achieve a 4% gain. Higher scores indicate better probability based on volatility, target distance, and efficiency.')
    pdf.ln(2)

    prob4_components = [
        ('Target Reachable T1', '15', '> 2.0 ATR', '4% move fits in < 2 ATR (high prob)'),
        ('Target Reachable T2', '12', '> 1.5 ATR', '4% move fits in ~2.67 ATR'),
        ('Target Reachable T3', '8', '> 1.0 ATR', '4% move fits in ~4 ATR'),
        ('Target Reachable T4', '3', '<= 1.0 ATR', '4% move needs > 4 ATR (low prob)'),
        ('Target Distance T1', '10', '0.25-2.0 ATR', 'Sweet spot: close enough, far enough'),
        ('Target Distance T2', '5', '0-3.0 ATR', 'Extended range'),
        ('Vol Sweet T1', '10', 'ATR percentile 30-70%', 'Moderate volatility'),
        ('Vol Sweet T2', '5', 'ATR percentile 20-80%', 'Broader moderate zone'),
        ('Efficiency Ratio', '5', '> 0.4', 'Price trending efficiently'),
    ]

    pdf.table_header(headers, widths)
    for i, row in enumerate(prob4_components):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('3.5 Modifiers', level=2)
    pdf.body_text('Modifiers adjust the entry score based on market structure and risk factors. Bonuses reward favorable conditions, while penalties penalize risky setups.')
    pdf.ln(2)

    modifiers = [
        ('Low Beta + Low Vol', '-10', 'beta < 0.5 AND atrPercentile < 25%', 'No expansion expected'),
        ('Spike Day', '-10', 'gapPct > 3% OR detectSpike', 'Blow-off top risk'),
        ('Stability Risk', '-15', 'stability20 < 0.3', 'Erratic price action'),
        ('MTF Alignment', '+10', 'D + W scores >= 65', 'Multi-timeframe confirmation'),
        ('High Vol Bonus', '+5', 'atrPercentile > 80 AND er > 0.5', 'Strong trend in high vol'),
    ]

    headers = ['Modifier', 'Amount', 'Condition', 'Meaning']
    widths = [40, 15, 70, 55]
    pdf.table_header(headers, widths)
    for i, row in enumerate(modifiers):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.ln(5)
    pdf.body_text('Score Bounds:')
    pdf.formula_block('Max Positive Modifiers: +10 (MTF) + 5 (High Vol) = +15')
    pdf.formula_block('Max Negative Modifiers: -10 (Low Beta) + -10 (Spike) + -15 (Stability) = -35')
    pdf.formula_block('Theoretical Range: -35 to 115, but capped to 0-100')

    pdf.add_page()
    pdf.chapter_title('3.6 Classification System', level=2)
    pdf.body_text('Entry scores are classified into five categories that determine position sizing and alerts:')
    pdf.ln(2)

    classifications = [
        ('STRONG_BUY', '>= 80', '100%', 'Green', 'Strong bullish setup, full position'),
        ('BUY', '>= 65', '70%', 'Green', 'Good setup, standard position'),
        ('WATCHLIST', '>= 50', '40%', 'Yellow', 'Potential setup, reduced position'),
        ('NEUTRAL', '>= 35', '0%', 'Purple', 'No clear signal, avoid'),
        ('AVOID', '< 35', '0%', 'Red', 'Weak setup, do not enter'),
    ]

    headers = ['Classification', 'Threshold', 'Allocation', 'Color', 'Description']
    widths = [30, 20, 20, 15, 95]
    pdf.table_header(headers, widths)
    for i, row in enumerate(classifications):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    # Chapter 4: Multi-Timeframe Scoring
    pdf.add_page()
    pdf.chapter_title('4. Multi-Timeframe Scoring')
    pdf.chapter_title('4.1 Timeframe Weights', level=2)
    pdf.body_text('When multiple timeframes are available, scores are aggregated using configurable weights:')
    pdf.ln(2)

    tf_weights = [
        ('Daily (D)', '55%', '0.55', 'Primary decision timeframe'),
        ('Hourly (H)', '30%', '0.30', 'Entry timing and short-term momentum'),
        ('Weekly (W)', '15%', '0.15', 'Higher timeframe context'),
    ]

    headers = ['Timeframe', 'Weight', 'Decimal', 'Role']
    widths = [35, 20, 20, 105]
    pdf.table_header(headers, widths)
    for i, row in enumerate(tf_weights):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.ln(5)
    pdf.chapter_title('4.2 Aggregation Logic', level=2)
    pdf.body_text('Each pillar is aggregated independently across timeframes:')
    pdf.ln(2)

    pdf.formula_block('Aggregated Pillar = (D_score * D_weight + H_score * H_weight + W_score * W_weight) / wSum')
    pdf.ln(2)
    pdf.body_text('Where wSum is the sum of weights for available timeframes. If a timeframe is missing, its weight is redistributed proportionally to the others.')
    pdf.ln(2)
    pdf.body_text('The aggregated pillar is then capped at its maximum (30/30/40) to prevent over-scoring.')
    pdf.ln(2)

    pdf.chapter_title('4.3 MTF Alignment Bonus', level=2)
    pdf.body_text('A +10 bonus is awarded when both Weekly and Daily raw scores are >= 65, indicating strong multi-timeframe confirmation.')
    pdf.ln(2)
    pdf.formula_block('MTF Bonus = +10 IF (Weekly_raw >= 65 AND Daily_raw >= 65)')
    pdf.ln(2)
    pdf.body_text('This bonus only applies when using multi-timeframe scoring. It is not available in single-timeframe mode.')

    # Chapter 5: Exit Score System
    pdf.add_page()
    pdf.chapter_title('5. Exit Score System')
    pdf.chapter_title('5.1 Four-Pillar Exit Model', level=2)
    pdf.body_text('The exit score uses a four-pillar model, each measuring a different aspect of deterioration:')
    pdf.ln(2)

    exit_pillars = [
        ('Trend Breakdown', '25', 'EMA/MACD/ADX breakdown signals'),
        ('Momentum Exhaustion', '25', 'RSI/StochRSI/CCI overbought'),
        ('Volume Distribution', '25', 'OBV/PVT/KVO divergence'),
        ('Structural Breakdown', '25', 'BB/Donchian/Ichimoku breakdown'),
    ]

    headers = ['Pillar', 'Max Points', 'Description']
    widths = [45, 25, 110]
    pdf.table_header(headers, widths)
    for i, row in enumerate(exit_pillars):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('5.2 Exit Modifiers', level=2)
    pdf.body_text('Exit modifiers adjust the exit score based on market conditions and position status:')
    pdf.ln(2)

    exit_modifiers = [
        ('Index trend >= 65', '-8', 'Strong market, reduce exit urgency'),
        ('EMA9>EMA21 + MACD bullish', '-5', 'Short-term trend intact'),
        ('Price decline 3 bars + low vol', '-6', 'Low conviction decline'),
        ('Near support (1.5% of S1)', '-5', 'Support may hold'),
        ('Held <3 days + entry >70', '-5', 'Too early to exit strong setup'),
        ('Index trend < 35', '+5', 'Weak market, increase exit urgency'),
        ('Distribution days >= 60%', '+5', 'Institutional selling'),
        ('Price < 97% of entry', '+5', 'Stop loss territory'),
        ('Price < 98.5% of entry', '+3', 'Approaching stop'),
        ('Price < HMA16 + EMA9', '+5', 'Short-term trend broken'),
        ('Golden exit (spike near 4%)', '+5', 'Take profit on spike'),
        ('Spike toward 4% (2-3%)', '+3', 'Lock partial profits'),
    ]

    headers = ['Condition', 'Amount', 'Meaning']
    widths = [55, 15, 110]
    pdf.table_header(headers, widths)
    for i, row in enumerate(exit_modifiers):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('5.3 Exit Classification', level=2)
    pdf.body_text('Exit scores are classified into six action levels:')
    pdf.ln(2)

    exit_classifications = [
        ('URGENT_EXIT', '>= 85', 'Full exit immediately'),
        ('EXIT', '>= 70', 'Full exit at current price'),
        ('PARTIAL_EXIT', '>= 55', 'Exit 50%, tighten stop to 1.5x ATR'),
        ('TIGHTEN_STOP', '>= 40', 'Move stop to breakeven or 1x ATR'),
        ('MONITOR', '>= 25', 'Watch for escalation'),
        ('HOLD', '< 25', 'All conditions intact'),
    ]

    headers = ['Classification', 'Threshold', 'Action']
    widths = [40, 25, 115]
    pdf.table_header(headers, widths)
    for i, row in enumerate(exit_classifications):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    # Chapter 6: Confidence Models
    pdf.add_page()
    pdf.chapter_title('6. Confidence Models')
    pdf.chapter_title('6.1 Session Confidence', level=2)
    pdf.body_text('Session Confidence answers: "Will the target hit TODAY?" It uses 15-minute intraday data, Session VWAP, intraday ADX, MFI, ROC, ADR headroom, and time remaining.')
    pdf.ln(2)

    session_labels = [
        ('>= 70', 'Let it ride - strong chance of tagging +4% today'),
        ('>= 40', 'Wait & watch - keep a tight stop'),
        ('< 40', 'Low odds - bank the gain today'),
    ]

    headers = ['Score', 'Recommendation']
    widths = [25, 155]
    pdf.table_header(headers, widths)
    for i, row in enumerate(session_labels):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('6.2 Horizon Confidence', level=2)
    pdf.body_text('Horizon Confidence answers: "Will the target hit in N days?" It uses a statistical lognormal model with drift (hourly/daily/RS) and volatility.')
    pdf.ln(2)

    horizon_labels = [
        ('>= 75', 'HIGH_CONVICTION', 'Strong statistical edge'),
        ('>= 60', 'CONFIDENT', 'Good probability'),
        ('>= 45', 'MODERATE', 'Average probability'),
        ('>= 30', 'LOW_CONVICTION', 'Below average'),
        ('< 30', 'UNFAVORABLE', 'Low probability'),
    ]

    headers = ['Score', 'Classification', 'Meaning']
    widths = [25, 40, 115]
    pdf.table_header(headers, widths)
    for i, row in enumerate(horizon_labels):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.ln(5)
    pdf.chapter_title('6.3 Forward Confidence', level=2)
    pdf.body_text('Forward Confidence is a 5-day or 10-day wrapper that estimates the probability of reaching +4% within the forward period. It is used in the screener for stock ranking.')

    # Chapter 7: Configuration
    pdf.add_page()
    pdf.chapter_title('7. Configuration')
    pdf.chapter_title('7.1 SCORE_CONFIG Parameters', level=2)
    pdf.body_text('All scoring parameters are centralized in SCORE_CONFIG, which is persisted to localStorage and can be modified via the UI. The configuration is organized into sections:')
    pdf.ln(2)

    config_sections = [
        ('pillarMax', 'Maximum scores for each pillar (30/30/40)'),
        ('tfWeights', 'Timeframe weights (D=0.55, H=0.30, W=0.15)'),
        ('trendHealth', '11 parameters for Trend Health pillar'),
        ('pullbackQuality', '12 parameters for Pullback Quality pillar'),
        ('prob4', '22 parameters for 4% Probability pillar'),
        ('modifiers', '12 parameters for modifiers'),
        ('classification', '4 thresholds for entry classification'),
    ]

    headers = ['Section', 'Description']
    widths = [50, 130]
    pdf.table_header(headers, widths)
    for i, row in enumerate(config_sections):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    pdf.add_page()
    pdf.chapter_title('7.2 Configurable Thresholds', level=2)
    pdf.body_text('Key configurable thresholds in SCORE_CONFIG:')
    pdf.ln(2)

    thresholds = [
        ('adxThreshold', '25', 'ADX level for trend confirmation'),
        ('mansfieldRSThreshold', '0', 'Minimum RS to outperform index'),
        ('sma20SlopeThreshold', '0', 'Minimum slope for rising SMA'),
        ('stochRSIThreshold', '20', 'StochRSI oversold level'),
        ('rsiOversoldNormal', '40', 'RSI oversold in normal vol'),
        ('rsiOversoldHighVol', '35', 'RSI oversold in high vol'),
        ('volRatioThreshold', '1.5', 'Volume confirmation multiplier'),
        ('targetATR_threshold1', '2.0', 'High probability ATR threshold'),
        ('targetATR_threshold2', '1.5', 'Medium probability threshold'),
        ('targetATR_threshold3', '1.0', 'Low probability threshold'),
        ('efficiencyRatioThreshold', '0.4', 'Minimum ER for trending'),
        ('mtfAlignThreshold', '65', 'Score for MTF alignment bonus'),
        ('spikeGapThreshold', '3', 'Gap % for spike detection'),
        ('stabilityThreshold', '0.3', 'Stability floor for penalty'),
    ]

    headers = ['Parameter', 'Default', 'Description']
    widths = [50, 20, 110]
    pdf.table_header(headers, widths)
    for i, row in enumerate(thresholds):
        pdf.table_row(row, widths, fill=(i % 2 == 0))

    # Appendix
    pdf.add_page()
    pdf.chapter_title('Appendix A: Key Formulas')
    pdf.chapter_title('A.1 ATR Percentile Rank', level=2)
    pdf.body_text('ATR Percentile Rank determines where current volatility sits relative to its 100-bar history:')
    pdf.formula_block('atrPercentile = (count of bars where ATR% < current ATR%) / 100 * 100')
    pdf.ln(2)

    pdf.chapter_title('A.2 Stability Score', level=2)
    pdf.body_text('Stability Score measures price consistency over the lookback period:')
    pdf.formula_block('stability = 0.6 * (positive_bars / total) + 0.4 * (1 - CV/2)')
    pdf.body_text('Where CV is the coefficient of variation of returns. Higher values indicate steadier price action.')
    pdf.ln(2)

    pdf.chapter_title('A.3 Efficiency Ratio', level=2)
    pdf.body_text('Efficiency Ratio measures how directly price moves toward its target:')
    pdf.formula_block('ER = |close - close_n| / sum(|close_i - close_i-1|) for i=1 to n')
    pdf.body_text('Values close to 1 indicate efficient trending; values near 0 indicate choppy price action.')
    pdf.ln(2)

    pdf.chapter_title('A.4 Mansfield Relative Strength', level=2)
    pdf.body_text('Mansfield RS measures relative strength vs its own 52-week moving average:')
    pdf.formula_block('RS = (stock/index * 100) / SMA(stock/index, 52) - 1) * 100')
    pdf.body_text('Positive values indicate the stock is outperforming its own historical relative strength.')

    # Save PDF
    output_path = r'C:\Users\vivek\Downloads\yr\StoX_Technical_Specification.pdf'
    pdf.output(output_path)
    print(f'PDF generated successfully: {output_path}')

if __name__ == '__main__':
    generate_spec()
