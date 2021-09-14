# Golos Auth & Registration Service

Сервис регистрации и серверной авторизации для проектов на блокчейне Golos Blockchain.
- [Web-интерфейс](https://auth.golos.today/register), позволяющий пользователям регистрировать свои аккаунты в Golos, и поддерживающий кастомизацию в стиле вашего проекта.
- Либо же, благодаря открытому коду, вы можете развернуть свою собственную, полностью кастомизированную, копию сервиса.
- Также есть API, позволяющее вам создать с нуля свой собственный сервис регистрации и\или серверной авторизации в Golos, но не тратить время на реализацию самого backend-функционала, а полностью посвятить себя дизайну UI/UX и добиться превосходного результата.
- Серверная авторизация, которую могут использовать ваши сервисы и микросервисы, в том случае, если нужно на стороне back-end авторизовывать аккаунты (однако в большинстве случаев этого делать не нужно, следует использовать [клиентскую авторизацию](https://github.com/golos-blockchain/libs/blob/master/golos-lib-js/docs/files/auth.md)).

## Кастомизация

Если вы разрабатываете приложение на платформе Golos, то в нем должна быть возможность регистрировать пользователей, как и в обычном приложении или сайте.
Вам не нужно делать свою собственную страницу регистрации и даже поднимать свою копию Golos Auth Service.
Сообщество Golos Blockchain само кастомизирует для вас уже имеющуюся cтраницу https://auth.golos.today/register, чтобы органично вписать ее в ваш клиент: дизайн, логотип, язык интерфейса и др.

Пример кастомизации в восхитительных фиолетовых тонах:
https://auth.golos.today/prizmtalk/register

Для кастомизации нам необходимо следующее:
1. Название вашего приложения и идентификатор, который вы хотите видеть в URL. В данном примере это "prizmtalk".
2. Таблицу стилей CSS, которую нужно добавить для кастомизации ([пример](https://devauth.golos.today/themes/prizmtalk/theme.css)). Кастомизировать можно абсолютно любой элемент страницы.
3. Логотип в любом удобном формате, в том числе анимированный.
4. Если сервис англоязычный, укажите это, и мы сделаем, что по умолчанию будет открываться английская версия страницы. Можем добавить и другие языки.

## Разворачивание своей копии сервиса

### Сборка

Сервису требуются [Docker](https://docs.docker.com/engine/install/) и [Docker-Compose](https://docs.docker.com/compose/install/).

```bash
docker-compose build
```

### Запуск

```bash
docker-compose up
```

## API для разработчиков

Нужно в случае, если вашему сервису требуется серверная авторизация, или если вы хотите сделать свою собственную страницу регистрации (а не кастомизировать нашу).

https://github.com/golos-blockchain/ui-auth/blob/master/API.md
