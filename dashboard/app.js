// OmniRadar Pro Dashboard Controller (Self-contained, Zero-Network)
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = {
    search: '',
    category: 'all',
    chain: 'all',
    momentum: 'all',
    sortKey: 'rank',
    sortAsc: true,
    activeTab: 'radar',
    selectedSlug: null,
  };

  var fmtUsd = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  };

  var fmtPct = function (n) {
    if (n === null || n === undefined || !isFinite(n)) return '0.00%';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };

  // Header & Metrics
  document.getElementById('hdr-as-of').textContent = 'As of: ' + DATA.as_of;
  document.getElementById('hdr-model-ver').textContent = DATA.model_version;
  document.getElementById('metric-protocols').textContent = DATA.board_size;
  document.getElementById('count-pre').textContent = DATA.board_size;
  document.getElementById('count-live').textContent = DATA.live_size;

  var totalImplied = 0;
  var sumMult = 0;
  for (var i = 0; i < DATA.rows.length; i++) {
    totalImplied += DATA.rows[i].implied_value_usd;
    sumMult += DATA.rows[i].category_multiple * DATA.rows[i].chain_multiplier;
  }
  document.getElementById('metric-total-implied').textContent = fmtUsd(totalImplied);
  document.getElementById('metric-avg-mult').textContent = (sumMult / DATA.rows.length).toFixed(2) + 'x';

  // Populate Category & Chain selectors
  var catSelect = document.getElementById('sel-category');
  var chainSelect = document.getElementById('sel-chain');
  var cats = {};
  var chains = {};

  for (var j = 0; j < DATA.rows.length; j++) {
    var r = DATA.rows[j];
    var c = r.category || 'Uncategorized';
    cats[c] = (cats[c] || 0) + 1;
    for (var k = 0; k < r.chains.length; k++) {
      var ch = r.chains[k];
      chains[ch] = (chains[ch] || 0) + 1;
    }
  }

  var sortedCats = Object.keys(cats).sort();
  for (var sc = 0; sc < sortedCats.length; sc++) {
    var opt = document.createElement('option');
    opt.value = sortedCats[sc];
    opt.textContent = sortedCats[sc] + ' (' + cats[sortedCats[sc]] + ')';
    catSelect.appendChild(opt);
  }

  var sortedChains = Object.keys(chains).sort(function (a, b) {
    return chains[b] - chains[a];
  });
  for (var sch = 0; sch < Math.min(sortedChains.length, 25); sch++) {
    var copt = document.createElement('option');
    copt.value = sortedChains[sch];
    copt.textContent = sortedChains[sch] + ' (' + chains[sortedChains[sch]] + ')';
    chainSelect.appendChild(copt);
  }

  // Filter & Sort
  function getFilteredRows() {
    return DATA.rows.filter(function (row) {
      if (state.search) {
        var q = state.search.toLowerCase();
        var matchName = row.name.toLowerCase().indexOf(q) >= 0;
        var matchSlug = row.slug.toLowerCase().indexOf(q) >= 0;
        var matchChain = row.chains.some(function (c) { return c.toLowerCase().indexOf(q) >= 0; });
        if (!matchName && !matchSlug && !matchChain) return false;
      }
      if (state.category !== 'all') {
        var rowCat = row.category || 'Uncategorized';
        if (rowCat !== state.category) return false;
      }
      if (state.chain !== 'all') {
        if (row.chains.indexOf(state.chain) < 0) return false;
      }
      if (state.momentum !== 'all') {
        var ch = row.change_7d || 0;
        if (state.momentum === 'surge' && ch <= 10) return false;
        if (state.momentum === 'positive' && (ch < 0 || ch > 10)) return false;
        if (state.momentum === 'negative' && ch >= 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      var av, bv;
      if (state.sortKey === 'rank') { av = a.rank; bv = b.rank; }
      else if (state.sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sortKey === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else if (state.sortKey === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sortKey === 'change') { av = a.change_7d || 0; bv = b.change_7d || 0; }
      else if (state.sortKey === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }

      if (av < bv) return state.sortAsc ? -1 : 1;
      if (av > bv) return state.sortAsc ? 1 : -1;
      return a.rank - b.rank;
    });
  }

  function renderRadarTable() {
    var tbody = document.getElementById('tbody-radar');
    tbody.innerHTML = '';
    var filtered = getFilteredRows();

    if (filtered.length === 0) {
      var trEmpty = document.createElement('tr');
      trEmpty.innerHTML = '<td colspan="9" style="text-align:center; padding: 40px; color: var(--text-muted); font-size: 14px;">No protocols match the selected criteria. Try resetting filters.</td>';
      tbody.appendChild(trEmpty);
      return;
    }

    filtered.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.addEventListener('click', function () {
        openDrawer(row.slug);
      });

      var chg = row.change_7d || 0;
      var chgClass = chg >= 0 ? 'pill-pos' : 'pill-neg';
      var topClass = row.rank <= 3 ? 'rank-top' : '';

      var chainBadges = row.chains.slice(0, 3).map(function (c) {
        return '<span class="pill pill-chain">' + c + '</span>';
      }).join('');
      if (row.chains.length > 3) {
        chainBadges += '<span class="pill pill-chain">+' + (row.chains.length - 3) + '</span>';
      }

      tr.innerHTML = [
        '<td><span class="rank-badge ' + topClass + '">' + row.rank + '</span></td>',
        '<td><div class="proto-cell"><span class="proto-name">' + row.name + '</span><span class="proto-slug">' + row.slug + '</span></div></td>',
        '<td><span class="pill">' + (row.category || 'DeFi') + '</span></td>',
        '<td>' + (chainBadges || '<span class="pill">Mainnet</span>') + '</td>',
        '<td class="text-right num-mono">' + fmtUsd(row.tvl_usd) + '</td>',
        '<td class="text-right"><span class="pill ' + chgClass + '">' + fmtPct(row.change_7d) + '</span></td>',
        '<td class="text-right num-mono text-accent">' + fmtUsd(row.implied_value_usd) + '</td>',
        '<td class="text-right num-mono" style="font-size: 12px; color: var(--text-muted);">' + (row.category_multiple * row.chain_multiplier).toFixed(2) + 'x</td>',
        '<td class="text-center"><button class="btn-action">Strategy</button></td>'
      ].join('');

      tbody.appendChild(tr);
    });
  }

  function renderLiveTable() {
    var tbody = document.getElementById('tbody-live');
    tbody.innerHTML = '';
    DATA.live.forEach(function (row) {
      var tr = document.createElement('tr');
      var mcapTvl = row.mcap_usd && row.tvl_usd ? (row.mcap_usd / row.tvl_usd).toFixed(2) + 'x' : 'n/a';
      var chg = row.change_7d || 0;
      var chgClass = chg >= 0 ? 'pill-pos' : 'pill-neg';

      tr.innerHTML = [
        '<td><strong>' + row.name + '</strong></td>',
        '<td><span class="pill">' + (row.category || 'DeFi') + '</span></td>',
        '<td><span class="pill pill-chain">' + (row.chains[0] || 'Omni') + '</span></td>',
        '<td class="text-right num-mono">' + fmtUsd(row.tvl_usd) + '</td>',
        '<td class="text-right num-mono text-accent">' + fmtUsd(row.mcap_usd) + '</td>',
        '<td class="text-right num-mono">' + mcapTvl + '</td>',
        '<td class="text-right"><span class="pill ' + chgClass + '">' + fmtPct(row.change_7d) + '</span></td>'
      ].join('');
      tbody.appendChild(tr);
    });
  }

  // Drawer Interactions
  function openDrawer(slug) {
    var row = DATA.rows.find(function (r) { return r.slug === slug; });
    if (!row) return;

    state.selectedSlug = slug;
    document.getElementById('drawer-name').textContent = row.name;
    document.getElementById('drawer-category').textContent = (row.category || 'DeFi') + ' · ' + (row.chains[0] || 'Multi-chain');
    document.getElementById('drawer-tvl').textContent = fmtUsd(row.tvl_usd);
    document.getElementById('drawer-implied').textContent = fmtUsd(row.implied_value_usd);
    document.getElementById('drawer-cat-mult').textContent = row.category_multiple.toFixed(2) + 'x';
    document.getElementById('drawer-chain-mult').textContent = row.chain_multiplier.toFixed(2) + 'x';
    document.getElementById('drawer-growth-mult').textContent = row.growth_multiplier.toFixed(2) + 'x';
    document.getElementById('drawer-maturity-mult').textContent = row.maturity_multiplier.toFixed(2) + 'x';

    // Fetch farm steps from board row if present
    var stepsList = document.getElementById('drawer-steps');
    stepsList.innerHTML = '';

    // Generate or read farm steps
    var steps = generateFarmSteps(row);
    steps.forEach(function (step) {
      var li = document.createElement('li');
      li.className = 'farm-step-card';
      li.innerHTML = [
        '<div class="step-body">' + step.text + '</div>',
        '<div class="step-meta">',
        '<span><strong>Cost:</strong> ' + step.cost + '</span>',
        '<span><strong>Time:</strong> ' + step.time + '</span>',
        '</div>'
      ].join('');
      stepsList.appendChild(li);
    });

    document.getElementById('protocol-drawer').classList.add('open');
    document.getElementById('drawer-backdrop').classList.add('open');
    document.getElementById('protocol-drawer').setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    document.getElementById('protocol-drawer').classList.remove('open');
    document.getElementById('drawer-backdrop').classList.remove('open');
    document.getElementById('protocol-drawer').setAttribute('aria-hidden', 'true');
    state.selectedSlug = null;
  }

  function generateFarmSteps(row) {
    var chain = row.chains[0] || 'its primary network';
    var c = (row.category || '').toLowerCase();
    var capital = row.tvl_usd >= 2e9 ? 250 : row.tvl_usd >= 5e8 ? 150 : row.tvl_usd >= 5e7 ? 100 : 50;
    var hold = row.age_days === null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;

    var gasSetup = 'under $0.25 of network gas';
    var gasWeekly = 'about $0.10 weekly';
    var chLow = chain.toLowerCase();
    if (chLow.indexOf('solana') >= 0) {
      gasSetup = 'under $0.02 of SOL gas';
      gasWeekly = 'under $0.01 weekly';
    } else if (chLow.indexOf('ethereum') >= 0) {
      gasSetup = 'about $8 to $18 of L1 gas';
      gasWeekly = 'about $5 of gas';
    }

    var action = 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + ' and maintain position.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('borrow') >= 0) {
      action = 'Supply $' + capital + ' of USDC or collateral to ' + row.name + ' on ' + chain + ', maintain a safe health factor above 1.8x, and optionally borrow a nominal 15% debt to establish two-sided market participation.';
    } else if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0) {
      action = 'Deposit $' + capital + ' into ' + row.name + '\'s core concentrated liquidity pool on ' + chain + ' (such as USDC/ETH or native pair), setting a medium price range to earn swap fees continuously.';
    } else if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) {
      action = 'Deposit $' + capital + ' USDC margin into ' + row.name + ' on ' + chain + ' and open an automated delta-neutral hedge position (1x long spot with matching 1x short perp) to accumulate volume with minimal market risk.';
    } else if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) {
      action = 'Execute an inbound bridge transfer of $' + capital + ' USDC to ' + chain + ' via ' + row.name + ', followed by at least two distinct route executions across separate weeks.';
    } else if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) {
      action = 'Stake $' + capital + ' worth of native tokens through ' + row.name + ' to mint receipt tokens, and keep the receipt tokens held in your farming address.';
    }

    return [
      { text: 'Isolate execution using a fresh, dedicated self-custodial wallet funded via direct exchange withdrawal to avoid Sybil clustering; secure seed phrase strictly offline.', cost: gasSetup + ' for wallet initialization', time: '10 minutes setup' },
      { text: action, cost: '$' + capital + ' allocated capital and ' + gasSetup, time: '15 minutes setup' },
      { text: 'Establish on-chain organic consistency by performing one small interaction every 7 to 10 days (rebalancing liquidity, claiming accrued fees, or submitting an on-chain vote).', cost: gasWeekly, time: '5 minutes weekly' },
      { text: 'Maintain uninterrupted capital commitment for at least ' + hold + ' consecutive days to ensure snapshot capture across multiple block epochs and retrospective reward rounds.', cost: '$' + capital + ' capital remains deployed', time: hold + ' days hold' },
      { text: 'Monitor official announcements and verified governance channels; verify points or eligibility dashboards directly from verified protocol links with zero transaction signatures until claim day.', cost: 'free monitoring and safety check', time: '10 minutes bi-weekly' },
      { text: 'Maintain an encrypted local transaction log recording wallet address, transaction hashes, timestamps, and position parameters to ensure clean, verifiable tax tracking and unwinding.', cost: 'no monetary cost', time: '5 minutes logging' }
    ];
  }

  // Event Listeners
  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawer();
  });

  document.getElementById('input-search').addEventListener('input', function (e) {
    state.search = e.target.value.trim();
    renderRadarTable();
  });

  document.getElementById('sel-category').addEventListener('change', function (e) {
    state.category = e.target.value;
    renderRadarTable();
  });

  document.getElementById('sel-chain').addEventListener('change', function (e) {
    state.chain = e.target.value;
    renderRadarTable();
  });

  document.getElementById('sel-momentum').addEventListener('change', function (e) {
    state.momentum = e.target.value;
    renderRadarTable();
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    state.search = '';
    state.category = 'all';
    state.chain = 'all';
    state.momentum = 'all';
    document.getElementById('input-search').value = '';
    document.getElementById('sel-category').value = 'all';
    document.getElementById('sel-chain').value = 'all';
    document.getElementById('sel-momentum').value = 'all';
    renderRadarTable();
  });

  // Table Sort Headers
  var ths = document.querySelectorAll('#table-radar th.sortable');
  ths.forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortAsc = !state.sortAsc;
      } else {
        state.sortKey = key;
        state.sortAsc = key === 'rank' || key === 'name';
      }
      ths.forEach(function (t) { t.classList.remove('sorted-asc', 'sorted-desc'); });
      th.classList.add(state.sortAsc ? 'sorted-asc' : 'sorted-desc');
      renderRadarTable();
    });
  });

  // Tab Switching
  var tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var tab = btn.getAttribute('data-tab');
      state.activeTab = tab;
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach(function (pane) {
        pane.classList.remove('active');
      });
      document.getElementById('pane-' + tab).classList.add('active');

      var controls = document.getElementById('radar-controls');
      controls.style.display = tab === 'radar' ? 'flex' : 'none';
    });
  });

  // Initial Render
  renderRadarTable();
  renderLiveTable();
})();
