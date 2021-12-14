import config from 'config';
import { hash, } from 'golos-lib-js/lib/auth/ecc';
import passport from 'passport';
import { Strategy as VKontakteStrategy, } from 'passport-vk';
import { Strategy as FacebookStrategy, } from 'passport-facebook';
import { Strategy as MailruStrategy, } from 'passport-mail';
import { Strategy as YandexStrategy, } from 'passport-yandex';
import Tarantool from '@/server/tarantool';
import { getRemoteIp, } from '@/server/misc';

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
    done(null, user);
});

const strategies = {
    vk: VKontakteStrategy, facebook: FacebookStrategy,
    mailru: MailruStrategy, yandex: YandexStrategy
};
for (const [grantId, grant] of Object.entries(config.grant)) {
    const strategy = strategies[grantId];
    if (!strategy || !grant.enabled) continue;
    try {
        passport.use(new strategy(
            {
                clientID: grant.key,
                clientSecret: grant.secret,
                callbackURL: `${config.rest_api}/api/reg/modal/${grantId}/callback`,
                passReqToCallback: true
            },
            async (req, accessToken, refreshToken, params, profile, done) => {
                req.session.soc_id = profile.id;
                req.session.soc_id_type = grantId + '_id';

                const idHash = hash.sha256(req.session.soc_id.toString(), 'hex');

                console.log('-- social select user');

                let user = await Tarantool.instance('tarantool').select('users', 'by_verify_uid',
                    1, 0, 'eq', ['social-' + grantId, idHash, req.session.uid]);

                if (!user[0]) {
                    console.log('-- social insert user');
                    user = await Tarantool.instance('tarantool').insert('users',
                        [null, req.session.uid, 'social-' + grantId, idHash, true, '1234', getRemoteIp(req), false]);
                }

                req.session.user = user[0][0];

                await req.session.save();

                done(null, {profile});
            }
        ));
    } catch (ex) {
        console.error(`ERROR: Wrong config.grant.${grantId} settings. Fix them or just disable registration with ${grantId}. Error is following:`)
        throw ex;
    }
}

export const addModalRoutes = (handler) => {
    return handler
    .get('/api/reg/modal/vk', (req, res, next) => {
        passport.authenticate('vkontakte')(req, res, next);
    })
    .get('/api/reg/modal/vk/callback', passport.authenticate('vkontakte', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }))

    .get('/api/reg/modal/facebook', (req, res, next) => {
        passport.authenticate('facebook')(req, res, next);
    })
    .get('/api/reg/modal/facebook/callback', passport.authenticate('facebook', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }))

    .get('/api/reg/modal/mailru', (req, res, next) => {
        passport.authenticate('mailru')(req, res, next);
    })
    .get('/api/reg/modal/mailru/callback', passport.authenticate('mailru', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }))

    .get('/api/reg/modal/yandex', (req, res, next) => {
        passport.authenticate('yandex')(req, res, next);
    })
    .get('/api/reg/modal/yandex/callback', passport.authenticate('yandex', {
        successRedirect: '/api/reg/modal/success',
        failureRedirect: '/api/reg/modal/failure'
    }))

    .get('/api/reg/modal/success', (req, res) => {
        res.status(200)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .send('<script>window.close();</script>');
    })
    .get('/api/reg/modal/failure', (req, res) => {
        res.status(200)
            .json({
                status: 'cannot_authorize',
                statusText: 'Cannot register - cannot authorize with social network.',
            });
    });
}

export default passport;
