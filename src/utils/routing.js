import { Router, useRouter, } from 'next/router';

// In future we can make it wrapping all Router methods
// (manually write them or automatically generate in runtime?)
// and it will be only 1 prop: router={router}
class RouterHelpers {
    constructor(router) {
        this.router = router;
    }

    refresh = () => {
        //setTimeout to fix "missfires" on development mode
        setTimeout(() => {
            this.router.replace(this.router.asPath)
        }, 50);
    }
}

export function withRouterHelpers(TheComponent) {
    return function Wrapper(props) {
        let router = useRouter();
        let routerHelpers = new RouterHelpers(router);
        return <TheComponent {...props} router={router} routerHelpers={routerHelpers} />;
    }
}

// Also it is good to have a hook version (useRouterHelpers)
