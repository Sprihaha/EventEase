import xml.etree.ElementTree as ET


def test_sitemap_xml_endpoints(client):
    # Test both root and api/v1 paths
    for path in ("/sitemap.xml", "/api/v1/sitemap.xml"):
        res = client.get(path)
        assert res.status_code == 200
        assert "application/xml" in res.headers["content-type"]
        xml_text = res.text

        # Verify valid XML
        root = ET.fromstring(xml_text)
        assert "urlset" in root.tag

        # Namespaces
        ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [el.text for el in root.findall("ns:url/ns:loc", ns)]

        assert "https://eventease-frontend.onrender.com/" in locs
        assert "https://eventease-frontend.onrender.com/events" in locs
        assert "https://eventease-frontend.onrender.com/community" in locs
