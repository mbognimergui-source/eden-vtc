"""
Tests pour la défense en profondeur contre la traversée de répertoire dans
`main.serve_frontend`. Le middleware de sécurité bloque déjà les motifs
"../" explicites dans le chemin de requête brut, mais ce handler ne doit
pas dépendre uniquement de ce filtre par expression régulière : il doit
lui-même refuser de servir un fichier situé hors du dossier du frontend
construit, quelle que soit la façon dont `full_path` a été obtenu.
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402


@pytest.fixture
def fake_frontend_dist(monkeypatch):
    """Construit une arborescence temporaire imitant frontend/dist, avec un
    fichier "secret" volontairement placé EN DEHORS pour simuler une cible
    de traversée de répertoire."""
    with tempfile.TemporaryDirectory() as tmp_root:
        dist_dir = os.path.join(tmp_root, "dist")
        os.makedirs(dist_dir)

        with open(os.path.join(dist_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write("<html>spa shell</html>")

        assets_dir = os.path.join(dist_dir, "assets")
        os.makedirs(assets_dir)
        with open(os.path.join(assets_dir, "app.js"), "w", encoding="utf-8") as f:
            f.write("console.log('ok');")

        secret_path = os.path.join(tmp_root, "secret.txt")
        with open(secret_path, "w", encoding="utf-8") as f:
            f.write("SHOULD NEVER BE SERVED")

        monkeypatch.setattr(main, "_FRONTEND_DIST", dist_dir)
        yield {"dist_dir": dist_dir, "secret_path": secret_path}


class TestServeFrontendPathTraversal:
    @pytest.mark.asyncio
    async def test_serves_legitimate_asset(self, fake_frontend_dist):
        response = await main.serve_frontend("assets/app.js")
        assert response.path == os.path.realpath(os.path.join(fake_frontend_dist["dist_dir"], "assets", "app.js"))

    @pytest.mark.asyncio
    async def test_traversal_outside_dist_falls_back_to_spa_shell_not_the_secret_file(self, fake_frontend_dist):
        response = await main.serve_frontend("../secret.txt")
        served_path = os.path.realpath(response.path)

        assert served_path != os.path.realpath(fake_frontend_dist["secret_path"])
        assert served_path == os.path.realpath(os.path.join(fake_frontend_dist["dist_dir"], "index.html"))

    @pytest.mark.asyncio
    async def test_deep_traversal_also_falls_back_to_spa_shell(self, fake_frontend_dist):
        response = await main.serve_frontend("../../../../../../etc/passwd")
        served_path = os.path.realpath(response.path)

        assert served_path == os.path.realpath(os.path.join(fake_frontend_dist["dist_dir"], "index.html"))

    @pytest.mark.asyncio
    async def test_unknown_path_falls_back_to_spa_shell(self, fake_frontend_dist):
        response = await main.serve_frontend("some/client/side/route")
        served_path = os.path.realpath(response.path)

        assert served_path == os.path.realpath(os.path.join(fake_frontend_dist["dist_dir"], "index.html"))

    @pytest.mark.asyncio
    async def test_api_prefixed_paths_are_never_served_as_static_files(self, fake_frontend_dist):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await main.serve_frontend("api/v1/whatever")
        assert exc_info.value.status_code == 404
