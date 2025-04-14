const NATURAL_SIZE = '0x0/'

const fixHost = (host) => {
    if (host.endsWith('/')) {
        host = host.slice(0, -1)
    }
    return host
};

export const proxifyImageUrl = (imagesCfg, url, dimensions = NATURAL_SIZE) => {
    if (!imagesCfg || !dimensions)
        return url;
    if (dimensions[dimensions.length - 1] !== '/')
        dimensions += '/'
    let prefix = ''
    if (imagesCfg.img_proxy_prefix) prefix += fixHost(imagesCfg.img_proxy_prefix) + '/' + dimensions
    if (imagesCfg.img_proxy_backup_prefix) prefix += fixHost(imagesCfg.img_proxy_backup_prefix) + '/' + dimensions
    return prefix + url
}

export const proxifyTokenImage = (imagesCfg, url) => {
    if (!imagesCfg)
      return url
    if (!url || !url.startsWith || !url.startsWith('http'))
      return url
    let prefix = ''
    if (imagesCfg.img_proxy_prefix && imagesCfg.use_img_proxy !== false) prefix += fixHost(imagesCfg.img_proxy_prefix) + '/orig/png/'
    if (imagesCfg.img_proxy_backup_prefix) prefix += fixHost(imagesCfg.img_proxy_backup_prefix) + '/0x0/'
    return prefix + url
}
