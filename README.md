# 珠海安心飞地图

纯静态版无人机飞前辅助地图，可直接部署到 Cloudflare Pages。

## Cloudflare Pages
- Framework preset: None
- Build command: 留空
- Build output directory: `public`

## 数据说明
- UOM 蓝区：目前为本地复现参考数据，不是 UOM 实时官方接口。
- 铁路轨迹：来自 OpenStreetMap 公开铁路关系数据。
- 本工具规则：铁路中心线 0–100 米按禁飞显示，100–500 米按报备区显示。
- 最终飞行结论必须以 UOM、有效审批、临时管制与现场要求为准。
