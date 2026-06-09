require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

// Step 1: Redirect user to WeChat authorization page
app.get('/auth/wechat', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    appid: process.env.WECHAT_APP_ID,
    redirect_uri: process.env.REDIRECT_URI,
    response_type: 'code',
    scope: 'snsapi_userinfo',
    state,
  });

  res.redirect(
    `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`
  );
});

// Step 2: WeChat redirects back with code + state
app.get('/auth/wechat/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  if (state !== req.session.oauthState) {
    return res.redirect('/?error=invalid_state');
  }

  try {
    // Exchange authorization code for access token
    const tokenRes = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET,
        code,
        grant_type: 'authorization_code',
      },
    });

    const { access_token, openid, errcode, errmsg } = tokenRes.data;

    if (errcode) {
      console.error('WeChat token error:', errmsg);
      return res.redirect(`/?error=${encodeURIComponent(errmsg)}`);
    }

    // Fetch user profile
    const userRes = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
      params: { access_token, openid, lang: 'zh_CN' },
    });

    if (userRes.data.errcode) {
      console.error('WeChat userinfo error:', userRes.data.errmsg);
      return res.redirect(`/?error=${encodeURIComponent(userRes.data.errmsg)}`);
    }

    const u = userRes.data;
    req.session.user = {
      openid: u.openid,
      nickname: u.nickname,
      avatar: u.headimgurl,
      sex: u.sex,
      city: u.city,
      province: u.province,
      country: u.country,
    };

    res.redirect('/profile');
  } catch (err) {
    console.error('WeChat OAuth error:', err.message);
    res.redirect('/?error=oauth_failed');
  }
});

// API: return current session user
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    return res.json({ user: req.session.user });
  }
  res.status(401).json({ error: 'not_logged_in' });
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Profile page — requires login
app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
